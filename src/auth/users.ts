import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AUTH_IDENTITIES_COLLECTION, SYSTEM_CONFIG_COLLECTION, USERS_COLLECTION } from "../db/firestore.js";

export const LEGACY_USER_ID = "local";
export const LEGACY_IMPORT_CONFIG_ID = "legacy-import";

export type AuthProvider = "google" | "line";

export interface AuthIdentityInput {
  provider: AuthProvider;
  subject: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
}

export interface StudyKarteUser {
  id: string;
  display_name?: string | null;
  email?: string | null;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

function identityId(provider: AuthProvider, subject: string): string {
  return createHash("sha256").update(`${provider}:${subject}`).digest("hex");
}

export async function findOrCreateUserForIdentity(
  db: Firestore,
  identity: AuthIdentityInput,
): Promise<StudyKarteUser> {
  const identityRef = db.collection(AUTH_IDENTITIES_COLLECTION).doc(identityId(identity.provider, identity.subject));
  const userId = randomUUID();
  const now = new Date().toISOString();

  const result = await db.runTransaction(async (tx) => {
    const existingIdentity = await tx.get(identityRef);
    if (existingIdentity.exists) {
      const existingUserId = existingIdentity.get("user_id") as string;
      const existingUser = await tx.get(db.collection(USERS_COLLECTION).doc(existingUserId));
      if (!existingUser.exists) throw new Error(`StudyKarteUser not found: ${existingUserId}`);
      return existingUser.data() as StudyKarteUser;
    }

    const user: StudyKarteUser = {
      id: userId,
      display_name: identity.displayName ?? null,
      email: identity.email ?? null,
      photo_url: identity.photoUrl ?? null,
      created_at: now,
      updated_at: now,
    };

    tx.set(db.collection(USERS_COLLECTION).doc(user.id), user);
    tx.set(identityRef, {
      provider: identity.provider,
      subject: identity.subject,
      user_id: user.id,
      email: identity.email ?? null,
      created_at: now,
      updated_at: now,
    });
    return user;
  });

  return result;
}

export async function linkIdentityToUser(
  db: Firestore,
  userId: string,
  identity: AuthIdentityInput,
): Promise<void> {
  const identityRef = db.collection(AUTH_IDENTITIES_COLLECTION).doc(identityId(identity.provider, identity.subject));
  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  const now = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    const [user, existingIdentity] = await Promise.all([tx.get(userRef), tx.get(identityRef)]);
    if (!user.exists) throw new Error(`StudyKarteUser not found: ${userId}`);
    if (existingIdentity.exists && existingIdentity.get("user_id") !== userId) {
      throw new Error("AuthIdentity is already linked to another user");
    }

    tx.set(
      identityRef,
      {
        provider: identity.provider,
        subject: identity.subject,
        user_id: userId,
        email: identity.email ?? null,
        created_at: existingIdentity.get("created_at") ?? now,
        updated_at: now,
      },
      { merge: true },
    );
  });
}

export async function resolveLegacyApiKeyUserId(db: Firestore): Promise<string> {
  const claim = await db.collection(SYSTEM_CONFIG_COLLECTION).doc(LEGACY_IMPORT_CONFIG_ID).get();
  const userId = claim.get("user_id");
  return typeof userId === "string" ? userId : LEGACY_USER_ID;
}
