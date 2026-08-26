import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_IDENTITIES_COLLECTION,
  getDb,
  KARTES_COLLECTION,
  LEARNING_ITEMS_COLLECTION,
  OAUTH_CODES_COLLECTION,
  OAUTH_TOKENS_COLLECTION,
  REVIEW_EVENTS_COLLECTION,
  USERS_COLLECTION,
} from "../src/db/firestore.js";
import { addLearningItem } from "../src/tools/addLearningItem.js";
import { createKarte } from "../src/tools/kartes.js";
import { findOrCreateUserForIdentity } from "../src/auth/users.js";
import { deleteUserData, exportUserData } from "../src/tools/dataRights.js";

const db = getDb();

async function clearCollection(name: string): Promise<void> {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

async function clearAll(): Promise<void> {
  await clearCollection(LEARNING_ITEMS_COLLECTION);
  await clearCollection(KARTES_COLLECTION);
  await clearCollection(OAUTH_CODES_COLLECTION);
  await clearCollection(OAUTH_TOKENS_COLLECTION);
  await clearCollection(REVIEW_EVENTS_COLLECTION);
  await clearCollection(AUTH_IDENTITIES_COLLECTION);
  await clearCollection(USERS_COLLECTION);
}

describe("data rights: export and deletion (Firestore emulator)", () => {
  beforeEach(clearAll);
  afterAll(clearAll);

  it("exports only the requesting user's kartes and learning items", async () => {
    const owner = await findOrCreateUserForIdentity(db, { provider: "google", subject: "owner-1", email: "owner@example.com" });
    const karte = await createKarte(db, owner.id, { name: "英語・仕事" });
    await addLearningItem(db, owner.id, {
      karte_id: karte.id, language: "en", type: "vocabulary", surface: "scope", meaning: "範囲",
    });
    await addLearningItem(db, "someone-else", {
      karte_id: "uncategorized", language: "en", type: "vocabulary", surface: "other", meaning: "他人のデータ",
    });

    const bundle = await exportUserData(db, owner.id);

    expect(bundle.format).toBe("study-karte-data-export");
    expect(bundle.user?.id).toBe(owner.id);
    expect(bundle.kartes.map((k) => k.id)).toEqual([karte.id]);
    expect(bundle.learning_items.map((i) => i.surface)).toEqual(["scope"]);
  });

  it("deletes all of a user's data without touching other users' data", async () => {
    const owner = await findOrCreateUserForIdentity(db, { provider: "google", subject: "owner-2", email: "owner2@example.com" });
    const karte = await createKarte(db, owner.id, { name: "中国語" });
    await addLearningItem(db, owner.id, {
      karte_id: karte.id, language: "zh-CN", type: "vocabulary", surface: "你好", meaning: "こんにちは",
    });
    const otherItem = await addLearningItem(db, "someone-else", {
      karte_id: "uncategorized", language: "en", type: "vocabulary", surface: "other", meaning: "他人のデータ",
    });

    const summary = await deleteUserData(db, owner.id);

    expect(summary.kartes).toBe(1);
    expect(summary.learning_items).toBe(1);
    expect(summary.account_deleted).toBe(true);
    expect((await db.collection(USERS_COLLECTION).doc(owner.id).get()).exists).toBe(false);
    expect((await db.collection(KARTES_COLLECTION).where("user_id", "==", owner.id).get()).empty).toBe(true);
    expect((await db.collection(LEARNING_ITEMS_COLLECTION).doc(otherItem.id).get()).exists).toBe(true);
  });
});
