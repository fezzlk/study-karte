import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { LEARNING_ITEMS_COLLECTION } from "../db/firestore.js";
import { assertKarteOwnedByUser } from "./kartes.js";
import type { LearningItem } from "./addLearningItem.js";

export const moveLearningItemInputShape = {
  learning_item_id: z.string().min(1).describe("移動するLearningItemのID"),
  karte_id: z.string().min(1).describe("移動先カルテID"),
};

const moveLearningItemInput = z.object(moveLearningItemInputShape);

export async function moveLearningItem(db: Firestore, userId: string, input: unknown): Promise<LearningItem> {
  const parsed = moveLearningItemInput.parse(input);
  await assertKarteOwnedByUser(db, userId, parsed.karte_id);

  const ref = db.collection(LEARNING_ITEMS_COLLECTION).doc(parsed.learning_item_id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("user_id") !== userId) {
    throw new Error(`LearningItem not found: ${parsed.learning_item_id}`);
  }

  const updated_at = new Date().toISOString();
  await ref.update({ karte_id: parsed.karte_id, updated_at });
  return { ...(snapshot.data() as LearningItem), karte_id: parsed.karte_id, updated_at };
}
