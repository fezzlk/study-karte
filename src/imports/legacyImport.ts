import { createHash } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  LEARNING_ITEMS_COLLECTION,
  REVIEW_EVENTS_COLLECTION,
  SYSTEM_CONFIG_COLLECTION,
} from "../db/firestore.js";
import { LEGACY_IMPORT_CONFIG_ID, LEGACY_USER_ID } from "../auth/users.js";

const nullableString = z.string().nullable().optional();
const learningItemSchema = z.object({
  id: z.string().uuid(),
  language: z.string().min(1),
  type: z.enum(["vocabulary", "phrase", "grammar"]),
  surface: z.string().min(1),
  reading: nullableString,
  meaning: z.string().min(1),
  note: nullableString,
  mastery: z.number().int().min(0).max(5),
  last_reviewed_at: nullableString,
  next_review_at: nullableString,
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

const reviewEventSchema = z.object({
  id: z.string().uuid(),
  learning_item_id: z.string().uuid(),
  reviewed_at: z.string().min(1),
  result: z.enum(["correct", "incorrect", "partial", "self_known"]),
  response_time_ms: z.number().int().nonnegative().nullable().optional(),
  agent: nullableString,
  quiz_type: nullableString,
  mastery_before: z.number().int().min(0).max(5),
  mastery_after: z.number().int().min(0).max(5),
  next_review_at: z.string().min(1),
});

const legacyImportSchema = z.object({
  format: z.literal("study-karte-legacy-export"),
  version: z.literal(1),
  exported_at: z.string().min(1),
  claim_token: z.string().min(32),
  learning_items: z.array(learningItemSchema).max(5000),
  review_events: z.array(reviewEventSchema).max(20000),
});

export type LegacyImportBundle = z.infer<typeof legacyImportSchema>;

export class LegacyImportError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message);
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertImportable(existingUserId: unknown, targetUserId: string, id: string): void {
  if (existingUserId !== undefined && existingUserId !== LEGACY_USER_ID && existingUserId !== targetUserId) {
    throw new LegacyImportError(`Import target is owned by another user: ${id}`, 409);
  }
}

export async function importLegacyData(
  db: Firestore,
  userId: string,
  input: unknown,
): Promise<{ learning_items: number; review_events: number; already_imported: boolean }> {
  const bundle = legacyImportSchema.parse(input);
  const claimRef = db.collection(SYSTEM_CONFIG_COLLECTION).doc(LEGACY_IMPORT_CONFIG_ID);
  const now = new Date().toISOString();

  const alreadyImported = await db.runTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists || claim.get("token_hash") !== tokenHash(bundle.claim_token)) {
      throw new LegacyImportError("Invalid legacy import file", 400);
    }
    if (claim.get("learning_item_count") !== bundle.learning_items.length || claim.get("review_event_count") !== bundle.review_events.length) {
      throw new LegacyImportError("Legacy import file count does not match the backup record", 400);
    }

    const claimedUserId = claim.get("user_id");
    if (claimedUserId && claimedUserId !== userId) {
      throw new LegacyImportError("Legacy data has been claimed by another user", 409);
    }
    if (claim.get("status") === "complete") return true;

    tx.update(claimRef, { user_id: userId, status: "importing", updated_at: now });
    return false;
  });

  if (alreadyImported) {
    return {
      learning_items: bundle.learning_items.length,
      review_events: bundle.review_events.length,
      already_imported: true,
    };
  }

  const entries: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [
    ...bundle.learning_items.map((item) => ({
      ref: db.collection(LEARNING_ITEMS_COLLECTION).doc(item.id),
      data: { ...item, user_id: userId },
    })),
    ...bundle.review_events.map((event) => ({
      ref: db.collection(REVIEW_EVENTS_COLLECTION).doc(event.id),
      data: { ...event, user_id: userId },
    })),
  ];

  for (let offset = 0; offset < entries.length; offset += 400) {
    const chunk = entries.slice(offset, offset + 400);
    const existing = await db.getAll(...chunk.map(({ ref }) => ref));
    existing.forEach((snapshot, index) => assertImportable(snapshot.get("user_id"), userId, chunk[index]!.ref.id));

    const batch = db.batch();
    for (const entry of chunk) batch.set(entry.ref, entry.data, { merge: false });
    await batch.commit();
  }

  await claimRef.update({ status: "complete", completed_at: now, updated_at: now });
  return {
    learning_items: bundle.learning_items.length,
    review_events: bundle.review_events.length,
    already_imported: false,
  };
}
