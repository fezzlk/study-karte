import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  reviewResults,
  SimpleReviewStrategy,
  type ReviewResult,
  type ReviewStrategy,
} from "../review/simpleReviewStrategy.js";
import { LEARNING_ITEMS_COLLECTION, REVIEW_EVENTS_COLLECTION } from "../db/firestore.js";

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
  response_time_ms?: number | null;
  agent?: string | null;
  quiz_type?: string | null;
  mastery_before: number;
  mastery_after: number;
  next_review_at: string;
}

export async function recordReviewResult(
  db: Firestore,
  userId: string,
  input: RecordReviewResultInput,
  strategy: ReviewStrategy = new SimpleReviewStrategy(),
  reviewedAt: Date = new Date(),
): Promise<ReviewEvent> {
  const parsed = recordReviewResultInput.parse(input);
  const itemRef = db.collection(LEARNING_ITEMS_COLLECTION).doc(parsed.learning_item_id);

  return db.runTransaction(async (tx) => {
    const itemSnap = await tx.get(itemRef);
    const item = itemSnap.data() as { mastery: number; user_id: string } | undefined;
    if (!item || item.user_id !== userId) {
      throw new Error(`LearningItem not found: ${parsed.learning_item_id}`);
    }

    const schedule = strategy.schedule(item.mastery, parsed.result, reviewedAt);
    const event: ReviewEvent = {
      id: randomUUID(),
      learning_item_id: parsed.learning_item_id,
      user_id: userId,
      reviewed_at: reviewedAt.toISOString(),
      result: parsed.result,
      response_time_ms: parsed.response_time_ms ?? null,
      agent: parsed.agent ?? null,
      quiz_type: parsed.quiz_type ?? null,
      mastery_before: item.mastery,
      mastery_after: schedule.mastery,
      next_review_at: schedule.nextReviewAt,
    };

    tx.set(db.collection(REVIEW_EVENTS_COLLECTION).doc(event.id), event);
    tx.update(itemRef, {
      mastery: event.mastery_after,
      last_reviewed_at: event.reviewed_at,
      next_review_at: event.next_review_at,
      updated_at: event.reviewed_at,
    });

    return event;
  });
}
