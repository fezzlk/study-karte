import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";

export const addLearningItemInputShape = {
  language: z.string().min(1).describe("対象言語（例: zh-CN, en）"),
  type: z.enum(["vocabulary", "phrase", "grammar"]).describe("学習項目の種別"),
  surface: z.string().min(1).describe("表記"),
  reading: z.string().optional().describe("発音・読み（任意）"),
  meaning: z.string().min(1).describe("ユーザー母語での意味"),
  note: z.string().optional().describe("補足（任意）"),
};

const addLearningItemInput = z.object(addLearningItemInputShape);

export type AddLearningItemInput = z.infer<typeof addLearningItemInput>;

export interface LearningItem extends AddLearningItemInput {
  id: string;
  user_id: string;
  mastery: number;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const LOCAL_USER_ID = "local";

export async function addLearningItem(db: Firestore, input: AddLearningItemInput): Promise<LearningItem> {
  const parsed = addLearningItemInput.parse(input);
  const now = new Date().toISOString();
  const item: LearningItem = {
    id: randomUUID(),
    user_id: LOCAL_USER_ID,
    mastery: 0,
    last_reviewed_at: null,
    next_review_at: null,
    created_at: now,
    updated_at: now,
    ...parsed,
  };

  await db.collection(LEARNING_ITEMS_COLLECTION).doc(item.id).set(item);

  return item;
}
