import type { Firestore } from "firebase-admin/firestore";
import {
  AUTH_IDENTITIES_COLLECTION,
  KARTES_COLLECTION,
  LEARNING_ITEMS_COLLECTION,
  OAUTH_CODES_COLLECTION,
  OAUTH_TOKENS_COLLECTION,
  REVIEW_EVENTS_COLLECTION,
  USERS_COLLECTION,
} from "../db/firestore.js";

export interface DataExportBundle {
  format: "study-karte-data-export";
  version: 1;
  exported_at: string;
  user: Record<string, unknown> | null;
  kartes: Record<string, unknown>[];
  learning_items: Record<string, unknown>[];
  review_events: Record<string, unknown>[];
}

async function docsWhereUser(
  db: Firestore,
  collection: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const snapshot = await db.collection(collection).where("user_id", "==", userId).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function exportUserData(db: Firestore, userId: string): Promise<DataExportBundle> {
  const [user, kartes, learningItems, reviewEvents] = await Promise.all([
    db.collection(USERS_COLLECTION).doc(userId).get(),
    docsWhereUser(db, KARTES_COLLECTION, userId),
    docsWhereUser(db, LEARNING_ITEMS_COLLECTION, userId),
    docsWhereUser(db, REVIEW_EVENTS_COLLECTION, userId),
  ]);

  return {
    format: "study-karte-data-export",
    version: 1,
    exported_at: new Date().toISOString(),
    user: user.exists ? user.data()! : null,
    kartes,
    learning_items: learningItems,
    review_events: reviewEvents,
  };
}

export interface DeletionSummary {
  kartes: number;
  learning_items: number;
  review_events: number;
  auth_identities: number;
  oauth_tokens: number;
  account_deleted: boolean;
}

async function deleteWhereUser(db: Firestore, collection: string, userId: string): Promise<number> {
  const snapshot = await db.collection(collection).where("user_id", "==", userId).get();
  let deleted = 0;
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const chunk = snapshot.docs.slice(offset, offset + 400);
    const batch = db.batch();
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export async function deleteUserData(db: Firestore, userId: string): Promise<DeletionSummary> {
  const [kartes, learningItems, reviewEvents, authIdentities, oauthTokens] = await Promise.all([
    deleteWhereUser(db, KARTES_COLLECTION, userId),
    deleteWhereUser(db, LEARNING_ITEMS_COLLECTION, userId),
    deleteWhereUser(db, REVIEW_EVENTS_COLLECTION, userId),
    deleteWhereUser(db, AUTH_IDENTITIES_COLLECTION, userId),
    deleteWhereUser(db, OAUTH_TOKENS_COLLECTION, userId),
  ]);
  // OAuth authorization codes are short-lived (5 minutes) and keyed by user_id like tokens.
  await deleteWhereUser(db, OAUTH_CODES_COLLECTION, userId);
  await db.collection(USERS_COLLECTION).doc(userId).delete();

  return {
    kartes,
    learning_items: learningItems,
    review_events: reviewEvents,
    auth_identities: authIdentities,
    oauth_tokens: oauthTokens,
    account_deleted: true,
  };
}
