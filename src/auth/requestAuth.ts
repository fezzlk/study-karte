import type { NextFunction, Request, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  findOrCreateUserForIdentity,
  resolveLegacyApiKeyUserId,
  type AuthProvider,
  type StudyKarteUser,
} from "./users.js";

export interface RequestIdentity {
  userId: string;
  method: "firebase" | "legacy_api_key";
  user?: StudyKarteUser;
}

declare global {
  namespace Express {
    interface Request {
      identity?: RequestIdentity;
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim();
}

function authProvider(firebaseProvider: string | undefined, customProvider: unknown): AuthProvider {
  if (customProvider === "line") return "line";
  if (firebaseProvider === "google.com") return "google";
  throw new Error(`Unsupported authentication provider: ${firebaseProvider ?? "unknown"}`);
}

export function createRequireIdentity(db: Firestore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = bearerToken(req);
      if (token) {
        const decoded = await getAuth().verifyIdToken(token);
        const user = await findOrCreateUserForIdentity(db, {
          provider: authProvider(decoded.firebase?.sign_in_provider, decoded.auth_provider),
          subject: decoded.uid,
          email: decoded.email,
          displayName: decoded.name,
          photoUrl: decoded.picture,
        });
        req.identity = { userId: user.id, method: "firebase", user };
        next();
        return;
      }

      const expected = process.env.STUDY_KARTE_API_KEY;
      if (expected && req.header("x-api-key") === expected) {
        req.identity = { userId: await resolveLegacyApiKeyUserId(db), method: "legacy_api_key" };
        next();
        return;
      }

      res.status(401).json({ error: "unauthorized" });
    } catch (error) {
      console.error("Authentication failed", error);
      res.status(401).json({ error: "unauthorized" });
    }
  };
}
