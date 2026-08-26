import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  AUTH_IDENTITIES_COLLECTION,
  getDb,
  LEARNING_ITEMS_COLLECTION,
  KARTES_COLLECTION,
  OAUTH_CODES_COLLECTION,
  OAUTH_TOKENS_COLLECTION,
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
import { createKarte } from "../src/tools/kartes.js";
import { exchangeToken, resolveOAuthAccessToken } from "../src/auth/oauth.js";

const db = getDb();
const TEST_USER_ID = "test-user";

async function clearCollection(name: string): Promise<void> {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

describe("review loop (Firestore emulator)", () => {
  beforeEach(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(KARTES_COLLECTION);
    await clearCollection(OAUTH_CODES_COLLECTION);
    await clearCollection(OAUTH_TOKENS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
    await clearCollection(AUTH_IDENTITIES_COLLECTION);
    await clearCollection(USERS_COLLECTION);
    await clearCollection(SYSTEM_CONFIG_COLLECTION);
  });

  afterAll(async () => {
    await clearCollection(LEARNING_ITEMS_COLLECTION);
    await clearCollection(KARTES_COLLECTION);
    await clearCollection(OAUTH_CODES_COLLECTION);
    await clearCollection(OAUTH_TOKENS_COLLECTION);
    await clearCollection(REVIEW_EVENTS_COLLECTION);
    await clearCollection(AUTH_IDENTITIES_COLLECTION);
    await clearCollection(USERS_COLLECTION);
    await clearCollection(SYSTEM_CONFIG_COLLECTION);
  });

  it("returns new and overdue items but excludes future reviews", async () => {
    const due = await addLearningItem(db, TEST_USER_ID, {
      karte_id: "uncategorized",
      language: "zh-CN",
      type: "vocabulary",
      surface: "你好",
      meaning: "こんにちは",
    });
    const future = await addLearningItem(db, TEST_USER_ID, {
      karte_id: "uncategorized",
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
      karte_id: "uncategorized",
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
      karte_id: "uncategorized",
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
      karte_id: "uncategorized",
      language: "en",
      type: "vocabulary",
      surface: "private",
      meaning: "非公開の",
    });
    await addLearningItem(db, "user-b", {
      karte_id: "uncategorized",
      language: "en",
      type: "vocabulary",
      surface: "separate",
      meaning: "分離した",
    });

    const items = await searchLearningItems(db, "user-a", { limit: 50 });
    expect(items.map((item) => item.surface)).toEqual(["private"]);
  });

  it("groups sessions and agents by an explicitly selected purpose Karte", async () => {
    const work = await createKarte(db, TEST_USER_ID, { name: "中国語・仕事" });
    const travel = await createKarte(db, TEST_USER_ID, { name: "中国語・旅行" });
    await addLearningItem(db, TEST_USER_ID, {
      karte_id: work.id, language: "zh-CN", type: "vocabulary", surface: "会议", meaning: "会議",
    });
    await addLearningItem(db, TEST_USER_ID, {
      karte_id: travel.id, language: "zh-CN", type: "phrase", surface: "多少钱？", meaning: "いくらですか？",
    });

    const workItems = await searchLearningItems(db, TEST_USER_ID, { karte_id: work.id, limit: 50 });
    expect(workItems.map((item) => item.surface)).toEqual(["会议"]);
  });

  it("rejects registration into another user's Karte", async () => {
    const karte = await createKarte(db, "user-a", { name: "English・Work" });
    await expect(addLearningItem(db, "user-b", {
      karte_id: karte.id, language: "en", type: "vocabulary", surface: "scope", meaning: "範囲",
    })).rejects.toThrow("Karte not found");
  });

  it("exchanges an OAuth code only once and resolves the resulting user", async () => {
    process.env.STUDY_KARTE_OAUTH_CLIENT_ID = "chatgpt-test-client";
    process.env.STUDY_KARTE_OAUTH_CLIENT_SECRET = "test-client-secret";
    const code = "sk_code_test-value";
    const redirectUri = "https://chatgpt.com/aip/g-test/oauth/callback";
    await db.collection(OAUTH_CODES_COLLECTION).doc(createHash("sha256").update(code).digest("hex")).set({
      user_id: "oauth-user", client_id: "chatgpt-test-client", redirect_uri: redirectUri,
      expires_at: new Date(Date.now() + 60_000).toISOString(), used_at: null,
    });

    const responses: Array<{ status?: number; body?: Record<string, unknown> }> = [];
    function response(index: number) {
      return {
        status(code: number) { responses[index]!.status = code; return this; },
        json(body: Record<string, unknown>) { responses[index]!.body = body; return this; },
      };
    }
    const request = { body: {
      grant_type: "authorization_code", client_id: "chatgpt-test-client",
      client_secret: "test-client-secret", code, redirect_uri: redirectUri,
    } };
    responses.push({});
    await exchangeToken(db, request as never, response(0) as never);
    const accessToken = responses[0]!.body?.access_token as string;
    expect(await resolveOAuthAccessToken(db, accessToken)).toBe("oauth-user");

    responses.push({});
    await exchangeToken(db, request as never, response(1) as never);
    expect(responses[1]).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
  });
});
