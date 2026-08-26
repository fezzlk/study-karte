import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response } from "express";
import { OAUTH_CODES_COLLECTION, OAUTH_TOKENS_COLLECTION } from "../db/firestore.js";
import { findOrCreateUserForIdentity } from "./users.js";

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;

type TokenKind = "access" | "refresh";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secretEquals(actual: unknown, expected: string | undefined): boolean {
  if (typeof actual !== "string" || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAllowedChatGptRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") &&
      /^\/aip\/g-[A-Za-z0-9_-]+\/oauth\/callback$/.test(url.pathname);
  } catch {
    return false;
  }
}

function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function oauthClientConfigured(): boolean {
  return Boolean(process.env.STUDY_KARTE_OAUTH_CLIENT_ID && process.env.STUDY_KARTE_OAUTH_CLIENT_SECRET);
}

function validClient(clientId: unknown, clientSecret?: unknown): boolean {
  if (clientId !== process.env.STUDY_KARTE_OAUTH_CLIENT_ID) return false;
  return clientSecret === undefined || secretEquals(clientSecret, process.env.STUDY_KARTE_OAUTH_CLIENT_SECRET);
}

export function authorizeRequest(req: Request, res: Response): void {
  const { client_id, redirect_uri, response_type, state } = req.query;
  if (!oauthClientConfigured()) { res.status(503).json({ error: "oauth_not_configured" }); return; }
  if (!validClient(client_id) || response_type !== "code" || typeof state !== "string" || !state ||
      typeof redirect_uri !== "string" || !isAllowedChatGptRedirect(redirect_uri)) {
    res.status(400).json({ error: "invalid_authorization_request" });
    return;
  }
  const params = new URLSearchParams({
    client_id: String(client_id), redirect_uri, response_type: "code", state,
  });
  res.redirect(302, `/oauth-authorize.html?${params}`);
}

export async function completeAuthorization(db: Firestore, req: Request, res: Response): Promise<void> {
  const { firebase_id_token, client_id, redirect_uri, state } = req.body as Record<string, unknown>;
  if (!validClient(client_id) || typeof state !== "string" || !state ||
      typeof redirect_uri !== "string" || !isAllowedChatGptRedirect(redirect_uri) ||
      typeof firebase_id_token !== "string") {
    res.status(400).json({ error: "invalid_authorization_request" });
    return;
  }

  const decoded = await getAuth().verifyIdToken(firebase_id_token);
  if (decoded.firebase?.sign_in_provider !== "google.com") {
    res.status(400).json({ error: "unsupported_identity_provider" });
    return;
  }
  const user = await findOrCreateUserForIdentity(db, {
    provider: "google", subject: decoded.uid, email: decoded.email,
    displayName: decoded.name, photoUrl: decoded.picture,
  });
  const code = randomToken("sk_code");
  const now = Date.now();
  await db.collection(OAUTH_CODES_COLLECTION).doc(sha256(code)).set({
    user_id: user.id, client_id, redirect_uri, created_at: new Date(now).toISOString(),
    expires_at: new Date(now + AUTHORIZATION_CODE_TTL_MS).toISOString(), used_at: null,
  });
  const callback = new URL(redirect_uri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  res.json({ redirect_to: callback.toString() });
}

function tokenData(userId: string, kind: TokenKind, now: number, ttl: number) {
  return {
    user_id: userId, kind, created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(), revoked_at: null,
  };
}

async function issueTokenPair(db: Firestore, userId: string): Promise<Record<string, unknown>> {
  const accessToken = randomToken("sk_at");
  const refreshToken = randomToken("sk_rt");
  const now = Date.now();
  const batch = db.batch();
  batch.set(db.collection(OAUTH_TOKENS_COLLECTION).doc(sha256(accessToken)), tokenData(userId, "access", now, ACCESS_TOKEN_TTL_MS));
  batch.set(db.collection(OAUTH_TOKENS_COLLECTION).doc(sha256(refreshToken)), tokenData(userId, "refresh", now, REFRESH_TOKEN_TTL_MS));
  await batch.commit();
  return { access_token: accessToken, token_type: "bearer", refresh_token: refreshToken, expires_in: ACCESS_TOKEN_TTL_MS / 1000 };
}

export async function exchangeToken(db: Firestore, req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  if (!validClient(body.client_id, body.client_secret)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (body.grant_type === "authorization_code") {
    if (typeof body.code !== "string" || typeof body.redirect_uri !== "string") {
      res.status(400).json({ error: "invalid_grant" }); return;
    }
    const ref = db.collection(OAUTH_CODES_COLLECTION).doc(sha256(body.code));
    const userId = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.get("used_at") || snapshot.get("client_id") !== body.client_id ||
          snapshot.get("redirect_uri") !== body.redirect_uri || Date.parse(snapshot.get("expires_at")) <= Date.now()) return undefined;
      tx.update(ref, { used_at: new Date().toISOString() });
      return snapshot.get("user_id") as string;
    });
    if (!userId) { res.status(400).json({ error: "invalid_grant" }); return; }
    res.json(await issueTokenPair(db, userId));
    return;
  }

  if (body.grant_type === "refresh_token" && typeof body.refresh_token === "string") {
    const ref = db.collection(OAUTH_TOKENS_COLLECTION).doc(sha256(body.refresh_token));
    const userId = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.get("kind") !== "refresh" || snapshot.get("revoked_at") ||
          Date.parse(snapshot.get("expires_at")) <= Date.now()) return undefined;
      tx.update(ref, { revoked_at: new Date().toISOString() });
      return snapshot.get("user_id") as string;
    });
    if (!userId) { res.status(400).json({ error: "invalid_grant" }); return; }
    res.json(await issueTokenPair(db, userId));
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
}

export async function resolveOAuthAccessToken(db: Firestore, token: string): Promise<string | undefined> {
  if (!token.startsWith("sk_at_")) return undefined;
  const snapshot = await db.collection(OAUTH_TOKENS_COLLECTION).doc(sha256(token)).get();
  if (!snapshot.exists || snapshot.get("kind") !== "access" || snapshot.get("revoked_at") ||
      Date.parse(snapshot.get("expires_at")) <= Date.now()) return undefined;
  return snapshot.get("user_id") as string;
}
