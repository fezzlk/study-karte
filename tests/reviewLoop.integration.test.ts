import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, LEARNING_ITEMS_COLLECTION, REVIEW_EVENTS_COLLECTION } from "../src/db/firestore.js";
import { addLearningItem } from "../src/tools/addLearningItem.js";
import { getDueReviews } from "../src/tools/getDueReviews.js";
import { recordReviewResult } from "../src/tools/recordReviewResult.js";

const db = getDb();

async function clearCollection(name: string): Promise<void> {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

describe("review loop (Firestore emulator)", () => {
  beforeEach(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
  });

  afterAll(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
  });

  it("returns new and overdue items but excludes future reviews", async () => {
    const due = await addLearningItem(db, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "你好",
      meaning: "こんにちは",
    });
    const future = await addLearningItem(db, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "再见",
      meaning: "さようなら",
    });
    await db
      .collection(LEARNING_ITEMS_COLLECTION)
      .doc(future.id)
      .update({ next_review_at: "2026-08-20T00:00:00.000Z" });

    const items = await getDueReviews(db, { language: "zh-CN", limit: 10 }, new Date("2026-08-18T00:00:00.000Z"));

    expect(items.map((item) => item.id)).toEqual([due.id]);
  });

  it("records a review and atomically updates the schedule", async () => {
    const item = await addLearningItem(db, {
      language: "en",
      type: "phrase",
      surface: "piece of cake",
      meaning: "簡単なこと",
    });
    const reviewedAt = new Date("2026-08-18T00:00:00.000Z");

    const event = await recordReviewResult(
      db,
      { learning_item_id: item.id, result: "correct", response_time_ms: 1200, agent: "inspector" },
      undefined,
      reviewedAt,
    );

    const storedItem = (await db.collection(LEARNING_ITEMS_COLLECTION).doc(item.id).get()).data();
    const storedEvent = (await db.collection(REVIEW_EVENTS_COLLECTION).doc(event.id).get()).data();

    expect(event.mastery_before).toBe(0);
    expect(event.mastery_after).toBe(1);
    expect(event.next_review_at).toBe("2026-08-19T00:00:00.000Z");
    expect(storedItem?.mastery).toBe(1);
    expect(storedItem?.last_reviewed_at).toBe(reviewedAt.toISOString());
    expect(storedEvent?.result).toBe("correct");
  });
});
