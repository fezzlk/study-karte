import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";
import { UNCATEGORIZED_KARTE_ID } from "./kartes.js";

export const searchLearningItemsInputShape = {
  karte_id: z.string().optional().describe("カルテIDで絞り込む"),
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

  if (parsed.karte_id && parsed.karte_id !== UNCATEGORIZED_KARTE_ID) query = query.where("karte_id", "==", parsed.karte_id);
  const snapshot = await query.orderBy("created_at", "desc").limit(parsed.karte_id === UNCATEGORIZED_KARTE_ID ? 200 : parsed.limit).get();
  const items = snapshot.docs.map((doc) => doc.data() as LearningItem);
  return (parsed.karte_id === UNCATEGORIZED_KARTE_ID
    ? items.filter((item) => !item.karte_id || item.karte_id === UNCATEGORIZED_KARTE_ID)
    : items).slice(0, parsed.limit);
}
