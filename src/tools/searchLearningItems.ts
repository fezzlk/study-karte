import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";

export const searchLearningItemsInputShape = {
  language: z.string().optional().describe("対象言語で絞り込む（例: zh-CN）"),
  type: z.enum(["vocabulary", "phrase", "grammar"]).optional().describe("種別で絞り込む"),
  limit: z.number().int().positive().max(200).default(50).describe("取得件数上限"),
};

const searchLearningItemsInput = z.object(searchLearningItemsInputShape);

export type SearchLearningItemsInput = z.infer<typeof searchLearningItemsInput>;

export async function searchLearningItems(
  db: Firestore,
  userId: string,
  input: SearchLearningItemsInput,
): Promise<LearningItem[]> {
  const parsed = searchLearningItemsInput.parse(input);

  let query: Query = db.collection(LEARNING_ITEMS_COLLECTION).where("user_id", "==", userId);

  if (parsed.language) query = query.where("language", "==", parsed.language);
  if (parsed.type) query = query.where("type", "==", parsed.type);

  const snapshot = await query.orderBy("created_at", "desc").limit(parsed.limit).get();
  return snapshot.docs.map((doc) => doc.data() as LearningItem);
}
