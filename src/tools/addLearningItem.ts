import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { KARTES_COLLECTION, LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";
import { assertKarteOwnedByUser, getDefaultKarteId, listKartes, UNCATEGORIZED_KARTE_ID, type Karte } from "./kartes.js";

export class KarteSelectionRequiredError extends Error {
  constructor(public readonly kartes: Karte[]) {
    super("karte_id is required and no default karte is set: select one first");
    this.name = "KarteSelectionRequiredError";
  }
}

export const addLearningItemInputShape = {
  karte_id: z.string().min(1).optional().describe(
    "登録先カルテID。省略時は利用者が設定した既定カルテへ登録する。既定未設定なら推測せずエラーで選択を求める",
  ),
  language: z.string().min(1).describe("対象言語（例: zh-CN, en）"),
  type: z.enum(["vocabulary", "phrase", "grammar"]).describe("学習項目の種別"),
  surface: z.string().min(1).describe("表記"),
  reading: z.string().optional().describe("発音・読み（任意）"),
  meaning: z.string().min(1).describe("ユーザー母語での意味"),
  note: z.string().optional().describe("補足（任意）"),
};

const addLearningItemInput = z.object(addLearningItemInputShape);

export type AddLearningItemInput = z.infer<typeof addLearningItemInput>;

export interface LearningItem {
  id: string;
  user_id: string;
  karte_id: string;
  language: string;
  type: "vocabulary" | "phrase" | "grammar";
  surface: string;
  reading?: string;
  meaning: string;
  note?: string;
  mastery: number;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddLearningItemResult extends LearningItem {
  karte_name: string;
}

async function resolveKarteName(db: Firestore, userId: string, karteId: string): Promise<string> {
  if (karteId === UNCATEGORIZED_KARTE_ID) return "未分類";
  const snapshot = await db.collection(KARTES_COLLECTION).doc(karteId).get();
  return snapshot.exists && snapshot.get("user_id") === userId ? (snapshot.get("name") as string) : karteId;
}

export async function addLearningItem(
  db: Firestore,
  userId: string,
  input: unknown,
): Promise<AddLearningItemResult> {
  const parsed = addLearningItemInput.parse(input);

  let karteId = parsed.karte_id;
  if (!karteId) {
    const defaultKarteId = await getDefaultKarteId(db, userId);
    if (!defaultKarteId) throw new KarteSelectionRequiredError(await listKartes(db, userId));
    karteId = defaultKarteId;
  }
  await assertKarteOwnedByUser(db, userId, karteId);

  const now = new Date().toISOString();
  const item: LearningItem = {
    id: randomUUID(),
    user_id: userId,
    karte_id: karteId,
    language: parsed.language,
    type: parsed.type,
    surface: parsed.surface,
    reading: parsed.reading,
    meaning: parsed.meaning,
    note: parsed.note,
    mastery: 0,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: now,
    updated_at: now,
  };

  await db.collection(LEARNING_ITEMS_COLLECTION).doc(item.id).set(item);

  return { ...item, karte_name: await resolveKarteName(db, userId, karteId) };
}
