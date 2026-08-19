import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";
import { LOCAL_USER_ID } from "./addLearningItem.js";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";

export const getDueReviewsInputShape = {
  language: z.string().optional().describe("対象言語で絞り込む（例: zh-CN）"),
  limit: z.number().int().positive().max(100).default(10).describe("取得件数上限"),
};

const getDueReviewsInput = z.object(getDueReviewsInputShape);
export type GetDueReviewsInput = z.infer<typeof getDueReviewsInput>;

function withLanguage(query: Query, language: string | undefined): Query {
  return language ? query.where("language", "==", language) : query;
}

export async function getDueReviews(
  db: Firestore,
  input: GetDueReviewsInput,
  now: Date = new Date(),
): Promise<LearningItem[]> {
  const parsed = getDueReviewsInput.parse(input);
  const collection = db.collection(LEARNING_ITEMS_COLLECTION).where("user_id", "==", LOCAL_USER_ID);

  // Firestore can't express "next_review_at IS NULL OR next_review_at <= now" in one query
  // (mixing equality-to-null with a range filter on the same field), so run two queries and merge.
  const neverReviewedQuery = withLanguage(collection, parsed.language)
    .where("next_review_at", "==", null)
    .orderBy("created_at", "asc")
    .limit(parsed.limit);

  const overdueQuery = withLanguage(collection, parsed.language)
    .where("next_review_at", "<=", now.toISOString())
    .orderBy("next_review_at", "asc")
    .limit(parsed.limit);

  const [neverReviewedSnapshot, overdueSnapshot] = await Promise.all([
    neverReviewedQuery.get(),
    overdueQuery.get(),
  ]);

  const neverReviewed = neverReviewedSnapshot.docs.map((doc) => doc.data() as LearningItem);
  const overdue = overdueSnapshot.docs.map((doc) => doc.data() as LearningItem);

  return [...neverReviewed, ...overdue].slice(0, parsed.limit);
}
