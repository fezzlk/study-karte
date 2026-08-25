import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";
import { UNCATEGORIZED_KARTE_ID } from "./kartes.js";

export const getDueReviewsInputShape = {
  karte_id: z.string().optional().describe("カルテIDで絞り込む"),
  language: z.string().optional().describe("対象言語で絞り込む（例: zh-CN）"),
  limit: z.number().int().positive().max(100).default(10).describe("取得件数上限"),
};

const getDueReviewsInput = z.object(getDueReviewsInputShape);
export type GetDueReviewsInput = z.infer<typeof getDueReviewsInput>;

function withLanguage(query: Query, language: string | undefined): Query {
  return language ? query.where("language", "==", language) : query;
}

function withKarte(query: Query, karteId: string | undefined): Query {
  return karteId && karteId !== UNCATEGORIZED_KARTE_ID ? query.where("karte_id", "==", karteId) : query;
}

export async function getDueReviews(
  db: Firestore,
  userId: string,
  input: GetDueReviewsInput,
  now: Date = new Date(),
): Promise<LearningItem[]> {
  const parsed = getDueReviewsInput.parse(input);
  const collection = db.collection(LEARNING_ITEMS_COLLECTION).where("user_id", "==", userId);

  // Firestore can't express "next_review_at IS NULL OR next_review_at <= now" in one query
  // (mixing equality-to-null with a range filter on the same field), so run two queries and merge.
  const neverReviewedQuery = withKarte(withLanguage(collection, parsed.language), parsed.karte_id)
    .where("next_review_at", "==", null)
    .orderBy("created_at", "asc")
    .limit(parsed.limit);

  const overdueQuery = withKarte(withLanguage(collection, parsed.language), parsed.karte_id)
    .where("next_review_at", "<=", now.toISOString())
    .orderBy("next_review_at", "asc")
    .limit(parsed.limit);

  const [neverReviewedSnapshot, overdueSnapshot] = await Promise.all([
    neverReviewedQuery.get(),
    overdueQuery.get(),
  ]);

  const neverReviewed = neverReviewedSnapshot.docs.map((doc) => doc.data() as LearningItem);
  const overdue = overdueSnapshot.docs.map((doc) => doc.data() as LearningItem);

  const merged = [...neverReviewed, ...overdue];
  return (parsed.karte_id === UNCATEGORIZED_KARTE_ID
    ? merged.filter((item) => !item.karte_id || item.karte_id === UNCATEGORIZED_KARTE_ID)
    : merged).slice(0, parsed.limit);
}
