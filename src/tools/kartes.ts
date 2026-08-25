import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { KARTES_COLLECTION } from "../db/firestore.js";

export const UNCATEGORIZED_KARTE_ID = "uncategorized";

export interface Karte {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export const createKarteInputShape = {
  name: z.string().trim().min(1).max(80).describe("学習目的が分かるカルテ名（例: 中国語・仕事）"),
  description: z.string().trim().max(500).optional().describe("カルテの目的や範囲（任意）"),
};

const createKarteInput = z.object(createKarteInputShape);

export async function createKarte(db: Firestore, userId: string, input: unknown): Promise<Karte> {
  const parsed = createKarteInput.parse(input);
  const now = new Date().toISOString();
  const karte: Karte = {
    id: randomUUID(), user_id: userId, name: parsed.name,
    description: parsed.description ?? null, created_at: now, updated_at: now,
  };
  await db.collection(KARTES_COLLECTION).doc(karte.id).set(karte);
  return karte;
}

export async function listKartes(db: Firestore, userId: string): Promise<Karte[]> {
  const snapshot = await db.collection(KARTES_COLLECTION).where("user_id", "==", userId).get();
  return snapshot.docs.map((doc) => doc.data() as Karte)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function assertKarteOwnedByUser(db: Firestore, userId: string, karteId: string): Promise<void> {
  if (karteId === UNCATEGORIZED_KARTE_ID) return;
  const snapshot = await db.collection(KARTES_COLLECTION).doc(karteId).get();
  if (!snapshot.exists || snapshot.get("user_id") !== userId) throw new Error(`Karte not found: ${karteId}`);
}
