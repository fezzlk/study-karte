import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  AUTH_IDENTITIES_COLLECTION,
  getDb,
  LEARNING_ITEMS_COLLECTION,
  REVIEW_EVENTS_COLLECTION,
  SYSTEM_CONFIG_COLLECTION,
  USERS_COLLECTION,
} from "../src/db/firestore.js";
import { addLearningItem } from "../src/tools/addLearningItem.js";
import { getDueReviews } from "../src/tools/getDueReviews.js";
import { recordReviewResult } from "../src/tools/recordReviewResult.js";
import { findOrCreateUserForIdentity, LEGACY_USER_ID, linkIdentityToUser } from "../src/auth/users.js";
import { searchLearningItems } from "../src/tools/searchLearningItems.js";
import { importLegacyData, LegacyImportError } from "../src/imports/legacyImport.js";

const db = getDb();
const TEST_USER_ID = "test-user";

async function clearCollection(name: string): Promise<void> {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

describe("review loop (Firestore emulator)", () => {
  beforeEach(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
    await clearCollection(AUTH_IDENTITIES_COLLECTION);
    await clearCollection(USERS_COLLECTION);
    await clearCollection(SYSTEM_CONFIG_COLLECTION);
  });

  afterAll(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
    await clearCollection(AUTH_IDENTITIES_COLLECTION);
    await clearCollection(USERS_COLLECTION);
    await clearCollection(SYSTEM_CONFIG_COLLECTION);
  });

  it("returns new and overdue items but excludes future reviews", async () => {
    const due = await addLearningItem(db, TEST_USER_ID, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "你好",
      meaning: "こんにちは",
    });
    const future = await addLearningItem(db, TEST_USER_ID, {
      language: "zh-CN",
      type: "vocabulary",
      surface: "再见",
      meaning: "さようなら",
    });
    await db
      .collection(LEARNING_ITEMS_COLLECTION)
      .doc(future.id)
      .update({ next_review_at: "2026-08-20T00:00:00.000Z" });

    const items = await getDueReviews(
      db,
      TEST_USER_ID,
      { language: "zh-CN", limit: 10 },
      new Date("2026-08-18T00:00:00.000Z"),
    );

    expect(items.map((item) => item.id)).toEqual([due.id]);
  });

  it("records a review and atomically updates the schedule", async () => {
    const item = await addLearningItem(db, TEST_USER_ID, {
      language: "en",
      type: "phrase",
      surface: "piece of cake",
      meaning: "簡単なこと",
    });
    const reviewedAt = new Date("2026-08-18T00:00:00.000Z");

    const event = await recordReviewResult(
      db,
      TEST_USER_ID,
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

  it("imports legacy data only with the matching backup token", async () => {
    const legacyItem = await addLearningItem(db, LEGACY_USER_ID, {
      language: "en",
      type: "vocabulary",
      surface: "encounter",
      meaning: "出会い",
    });

    const user = await findOrCreateUserForIdentity(db, {
      provider: "google",
      subject: "google-user-1",
      email: "owner@example.com",
      displayName: "Owner",
    });
    expect((await db.collection(LEARNING_ITEMS_COLLECTION).doc(legacyItem.id).get()).get("user_id")).toBe(LEGACY_USER_ID);

    const claimToken = "a-valid-random-looking-claim-token-for-tests";
    await db.collection(SYSTEM_CONFIG_COLLECTION).doc("legacy-import").set({
      token_hash: createHash("sha256").update(claimToken).digest("hex"),
      status: "available",
      learning_item_count: 1,
      review_event_count: 0,
    });
    const bundle = {
      format: "study-karte-legacy-export" as const,
      version: 1 as const,
      exported_at: "2026-08-22T00:00:00.000Z",
      claim_token: claimToken,
      learning_items: [legacyItem],
      review_events: [],
    };

    const result = await importLegacyData(db, user.id, bundle);
    const retried = await importLegacyData(db, user.id, bundle);
    const migrated = (await db.collection(LEARNING_ITEMS_COLLECTION).doc(legacyItem.id).get()).data();

    expect(migrated?.user_id).toBe(user.id);
    expect(result.already_imported).toBe(false);
    expect(retried.already_imported).toBe(true);
  });

  it("rejects a legacy import with a different token", async () => {
    await db.collection(SYSTEM_CONFIG_COLLECTION).doc("legacy-import").set({
      token_hash: createHash("sha256").update("correct-token-value-that-is-long-enough").digest("hex"),
      status: "available",
      learning_item_count: 0,
      review_event_count: 0,
    });

    await expect(
      importLegacyData(db, "user-a", {
        format: "study-karte-legacy-export",
        version: 1,
        exported_at: "2026-08-22T00:00:00.000Z",
        claim_token: "incorrect-token-value-that-is-long-enough",
        learning_items: [],
        review_events: [],
      }),
    ).rejects.toBeInstanceOf(LegacyImportError);
  });

  it("can link a future LINE identity without changing the Study Karte user", async () => {
    const user = await findOrCreateUserForIdentity(db, {
      provider: "google",
      subject: "google-user-1",
      email: "owner@example.com",
    });
    await linkIdentityToUser(db, user.id, { provider: "line", subject: "line-user-1" });

    const sameUser = await findOrCreateUserForIdentity(db, { provider: "line", subject: "line-user-1" });
    expect(sameUser.id).toBe(user.id);
  });

  it("keeps learning items isolated by Study Karte user", async () => {
    await addLearningItem(db, "user-a", {
      language: "en",
      type: "vocabulary",
      surface: "private",
      meaning: "非公開の",
    });
    await addLearningItem(db, "user-b", {
      language: "en",
      type: "vocabulary",
      surface: "separate",
      meaning: "分離した",
    });

    const items = await searchLearningItems(db, "user-a", { limit: 50 });
    expect(items.map((item) => item.surface)).toEqual(["private"]);
  });
});
