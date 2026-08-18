import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import SqliteDatabase from "better-sqlite3";
import { createDb } from "../src/db/client.js";
import { initSchema } from "../src/db/schema.js";
import { addLearningItem } from "../src/tools/addLearningItem.js";
import { getDueReviews } from "../src/tools/getDueReviews.js";
import { recordReviewResult } from "../src/tools/recordReviewResult.js";

describe("review loop", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("migrates a Phase 0 database without review columns", () => {
    const legacyDb = new SqliteDatabase(":memory:");
    legacyDb.exec(`
      CREATE TABLE learning_items (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, language TEXT NOT NULL,
        type TEXT NOT NULL, surface TEXT NOT NULL, reading TEXT, meaning TEXT NOT NULL,
        note TEXT, mastery INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    expect(() => initSchema(legacyDb)).not.toThrow();
    const columns = legacyDb.prepare("PRAGMA table_info(learning_items)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain("next_review_at");
  });

  it("returns new and overdue items but excludes future reviews", () => {
    const due = addLearningItem(db, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "你好",
      meaning: "こんにちは",
    });
    const future = addLearningItem(db, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "再见",
      meaning: "さようなら",
    });
    db.prepare("UPDATE learning_items SET next_review_at = ? WHERE id = ?").run(
      "2026-08-20T00:00:00.000Z",
      future.id,
    );

    const items = getDueReviews(db, { language: "zh-CN", limit: 10 }, new Date("2026-08-18T00:00:00.000Z"));

    expect(items.map((item) => item.id)).toEqual([due.id]);
  });

  it("records a review and atomically updates the schedule", () => {
    const item = addLearningItem(db, {
      language: "en",
      type: "phrase",
      surface: "piece of cake",
      meaning: "簡単なこと",
    });
    const reviewedAt = new Date("2026-08-18T00:00:00.000Z");

    const event = recordReviewResult(
      db,
      { learning_item_id: item.id, result: "correct", response_time_ms: 1200, agent: "inspector" },
      undefined,
      reviewedAt,
    );
    const storedItem = db.prepare("SELECT * FROM learning_items WHERE id = ?").get(item.id) as Record<string, unknown>;
    const storedEvent = db.prepare("SELECT * FROM review_events WHERE id = ?").get(event.id) as Record<string, unknown>;

    expect(event.mastery_before).toBe(0);
    expect(event.mastery_after).toBe(1);
    expect(event.next_review_at).toBe("2026-08-19T00:00:00.000Z");
    expect(storedItem.mastery).toBe(1);
    expect(storedItem.last_reviewed_at).toBe(reviewedAt.toISOString());
    expect(storedEvent.result).toBe("correct");
  });
});
