import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return initializeApp({
    credential: credentialsPath ? cert(credentialsPath) : applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID,
  });
}

let db: Firestore | undefined;

export function getDb(): Firestore {
  if (!db) db = getFirestore(getAdminApp());
  return db;
}

export const LEARNING_ITEMS_COLLECTION = "learning_items";
export const REVIEW_EVENTS_COLLECTION = "review_events";
export const USERS_COLLECTION = "users";
export const AUTH_IDENTITIES_COLLECTION = "auth_identities";
export const SYSTEM_CONFIG_COLLECTION = "system_config";
