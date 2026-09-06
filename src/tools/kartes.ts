import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { KARTES_COLLECTION, LEARNING_ITEMS_COLLECTION, USERS_COLLECTION } from "../db/firestore.js";

export const UNCATEGORIZED_KARTE_ID = "uncategorized";

export interface Karte {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  archived_at?: string | null;
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
    description: parsed.description ?? null, archived_at: null, created_at: now, updated_at: now,
  };
  await db.collection(KARTES_COLLECTION).doc(karte.id).set(karte);
  return karte;
}

export const listKartesInputShape = {
  include_archived: z.boolean().optional().describe("アーカイブ済みカルテも含める（既定は含めない）"),
};

const listKartesInput = z.object(listKartesInputShape);

export async function listKartes(db: Firestore, userId: string, input: unknown = {}): Promise<Karte[]> {
  const parsed = listKartesInput.parse(input);
  const snapshot = await db.collection(KARTES_COLLECTION).where("user_id", "==", userId).get();
  return snapshot.docs
    .map((doc) => doc.data() as Karte)
    .filter((karte) => parsed.include_archived || !karte.archived_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function assertKarteOwnedByUser(db: Firestore, userId: string, karteId: string): Promise<void> {
  if (karteId === UNCATEGORIZED_KARTE_ID) return;
  const snapshot = await db.collection(KARTES_COLLECTION).doc(karteId).get();
  if (!snapshot.exists || snapshot.get("user_id") !== userId) throw new Error(`Karte not found: ${karteId}`);
}

export const updateKarteInputShape = {
  karte_id: z.string().min(1).describe("更新するカルテID"),
  name: z.string().trim().min(1).max(80).optional().describe("変更後のカルテ名"),
  description: z.string().trim().max(500).nullable().optional().describe("変更後の説明。nullで削除"),
  archived: z.boolean().optional().describe("trueでアーカイブ、falseで復元"),
};

const updateKarteInput = z.object(updateKarteInputShape);

export async function updateKarte(db: Firestore, userId: string, input: unknown): Promise<Karte> {
  const parsed = updateKarteInput.parse(input);
  if (parsed.karte_id === UNCATEGORIZED_KARTE_ID) throw new Error("Karte not found: uncategorized is not a real karte");
  const ref = db.collection(KARTES_COLLECTION).doc(parsed.karte_id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("user_id") !== userId) throw new Error(`Karte not found: ${parsed.karte_id}`);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  if (parsed.name !== undefined) update.name = parsed.name;
  if (parsed.description !== undefined) update.description = parsed.description;
  if (parsed.archived !== undefined) update.archived_at = parsed.archived ? now : null;

  await ref.update(update);
  return { ...(snapshot.data() as Karte), ...update } as Karte;
}

export const mergeKartesInputShape = {
  from_karte_id: z.string().min(1).describe("統合元カルテID（統合後に削除される）"),
  into_karte_id: z.string().min(1).describe("統合先カルテID"),
};

const mergeKartesInput = z.object(mergeKartesInputShape);

export async function mergeKartes(db: Firestore, userId: string, input: unknown): Promise<Karte> {
  const parsed = mergeKartesInput.parse(input);
  if (parsed.from_karte_id === parsed.into_karte_id) throw new Error("from_karte_id and into_karte_id must differ");
  if (parsed.from_karte_id === UNCATEGORIZED_KARTE_ID) {
    throw new Error("Karte not found: uncategorized is not a real karte");
  }
  await assertKarteOwnedByUser(db, userId, parsed.into_karte_id);

  const fromRef = db.collection(KARTES_COLLECTION).doc(parsed.from_karte_id);
  const fromSnapshot = await fromRef.get();
  if (!fromSnapshot.exists || fromSnapshot.get("user_id") !== userId) {
    throw new Error(`Karte not found: ${parsed.from_karte_id}`);
  }

  const itemsSnapshot = await db
    .collection(LEARNING_ITEMS_COLLECTION)
    .where("user_id", "==", userId)
    .where("karte_id", "==", parsed.from_karte_id)
    .get();

  const now = new Date().toISOString();
  const batch = db.batch();
  for (const doc of itemsSnapshot.docs) batch.update(doc.ref, { karte_id: parsed.into_karte_id, updated_at: now });
  batch.delete(fromRef);
  await batch.commit();

  if (parsed.into_karte_id === UNCATEGORIZED_KARTE_ID) {
    return { id: UNCATEGORIZED_KARTE_ID, user_id: userId, name: "未分類", created_at: now, updated_at: now };
  }
  const intoSnapshot = await db.collection(KARTES_COLLECTION).doc(parsed.into_karte_id).get();
  return intoSnapshot.data() as Karte;
}

interface DefaultKarteRecord {
  default_karte_id?: string | null;
}

export async function getDefaultKarteId(db: Firestore, userId: string): Promise<string | null> {
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();
  const data = snapshot.data() as DefaultKarteRecord | undefined;
  return data?.default_karte_id ?? null;
}

export const setDefaultKarteInputShape = {
  karte_id: z.string().min(1).describe("既定として保存するカルテID（uncategorized指定可）"),
};

const setDefaultKarteInput = z.object(setDefaultKarteInputShape);

export async function setDefaultKarte(db: Firestore, userId: string, input: unknown): Promise<{ karte_id: string }> {
  const parsed = setDefaultKarteInput.parse(input);
  await assertKarteOwnedByUser(db, userId, parsed.karte_id);
  await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .set({ default_karte_id: parsed.karte_id, updated_at: new Date().toISOString() }, { merge: true });
  return { karte_id: parsed.karte_id };
}
