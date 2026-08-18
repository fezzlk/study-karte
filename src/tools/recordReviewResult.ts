import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  reviewResults,
  SimpleReviewStrategy,
  type ReviewResult,
  type ReviewStrategy,
} from "../review/simpleReviewStrategy.js";

export const recordReviewResultInputShape = {
  learning_item_id: z.string().uuid().describe("復習したLearningItemのID"),
  result: z.enum(reviewResults).describe("復習結果"),
  response_time_ms: z.number().int().nonnegative().optional().describe("回答時間（任意、ミリ秒）"),
  agent: z.string().min(1).optional().describe("出題したAI・アプリ（任意）"),
  quiz_type: z.string().min(1).optional().describe("出題形式（任意）"),
};

const recordReviewResultInput = z.object(recordReviewResultInputShape);
export type RecordReviewResultInput = z.infer<typeof recordReviewResultInput>;

export interface ReviewEvent {
  id: string;
  learning_item_id: string;
  user_id: string;
  reviewed_at: string;
  result: ReviewResult;
  response_time_ms?: number;
  agent?: string;
  quiz_type?: string;
  mastery_before: number;
  mastery_after: number;
  next_review_at: string;
}

const LOCAL_USER_ID = "local";

export function recordReviewResult(
  db: Database.Database,
  input: RecordReviewResultInput,
  strategy: ReviewStrategy = new SimpleReviewStrategy(),
  reviewedAt: Date = new Date(),
): ReviewEvent {
  const parsed = recordReviewResultInput.parse(input);
  const item = db
    .prepare("SELECT mastery FROM learning_items WHERE id = ? AND user_id = ?")
    .get(parsed.learning_item_id, LOCAL_USER_ID) as { mastery: number } | undefined;
  if (!item) {
    throw new Error(`LearningItem not found: ${parsed.learning_item_id}`);
  }

  const schedule = strategy.schedule(item.mastery, parsed.result, reviewedAt);
  const event: ReviewEvent = {
    id: randomUUID(),
    learning_item_id: parsed.learning_item_id,
    user_id: LOCAL_USER_ID,
    reviewed_at: reviewedAt.toISOString(),
    result: parsed.result,
    response_time_ms: parsed.response_time_ms,
    agent: parsed.agent,
    quiz_type: parsed.quiz_type,
    mastery_before: item.mastery,
    mastery_after: schedule.mastery,
    next_review_at: schedule.nextReviewAt,
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO review_events
        (id, learning_item_id, user_id, reviewed_at, result, response_time_ms, agent,
         quiz_type, mastery_before, mastery_after, next_review_at)
       VALUES
        (@id, @learning_item_id, @user_id, @reviewed_at, @result, @response_time_ms, @agent,
         @quiz_type, @mastery_before, @mastery_after, @next_review_at)`,
    ).run({
      ...event,
      response_time_ms: event.response_time_ms ?? null,
      agent: event.agent ?? null,
      quiz_type: event.quiz_type ?? null,
    });
    db.prepare(
      `UPDATE learning_items
       SET mastery = @mastery, last_reviewed_at = @reviewed_at,
           next_review_at = @next_review_at, updated_at = @reviewed_at
       WHERE id = @learning_item_id AND user_id = @user_id`,
    ).run({
      mastery: event.mastery_after,
      reviewed_at: event.reviewed_at,
      next_review_at: event.next_review_at,
      learning_item_id: event.learning_item_id,
      user_id: event.user_id,
    });
  })();

  return event;
}
