import type Database from "better-sqlite3";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";

export const getDueReviewsInputShape = {
  language: z.string().optional().describe("対象言語で絞り込む（例: zh-CN）"),
  limit: z.number().int().positive().max(100).default(10).describe("取得件数上限"),
};

const getDueReviewsInput = z.object(getDueReviewsInputShape);
export type GetDueReviewsInput = z.infer<typeof getDueReviewsInput>;

const LOCAL_USER_ID = "local";

export function getDueReviews(
  db: Database.Database,
  input: GetDueReviewsInput,
  now: Date = new Date(),
): LearningItem[] {
  const parsed = getDueReviewsInput.parse(input);
  const params: Record<string, unknown> = {
    user_id: LOCAL_USER_ID,
    now: now.toISOString(),
    limit: parsed.limit,
  };
  const languageCondition = parsed.language ? "AND language = @language" : "";
  if (parsed.language) params.language = parsed.language;

  return db
    .prepare(
      `SELECT * FROM learning_items
       WHERE user_id = @user_id
         AND (next_review_at IS NULL OR next_review_at <= @now)
         ${languageCondition}
       ORDER BY
         CASE WHEN next_review_at IS NULL THEN 0 ELSE 1 END,
         next_review_at ASC,
         created_at ASC
       LIMIT @limit`,
    )
    .all(params) as LearningItem[];
}
