import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";

export const addLearningItemInputShape = {
  language: z.string().min(1).describe("対象言語（例: zh-CN, en）"),
  type: z.enum(["vocabulary", "phrase", "grammar"]).describe("学習項目の種別"),
  surface: z.string().min(1).describe("表記"),
  reading: z.string().optional().describe("発音・読み（任意）"),
  meaning: z.string().min(1).describe("ユーザー母語での意味"),
  note: z.string().optional().describe("補足（任意）"),
};

const addLearningItemInput = z.object(addLearningItemInputShape);

export type AddLearningItemInput = z.infer<typeof addLearningItemInput>;

export interface LearningItem extends AddLearningItemInput {
  id: string;
  user_id: string;
  mastery: number;
  created_at: string;
  updated_at: string;
}

const LOCAL_USER_ID = "local";

export function addLearningItem(db: Database.Database, input: AddLearningItemInput): LearningItem {
  const parsed = addLearningItemInput.parse(input);
  const now = new Date().toISOString();
  const item: LearningItem = {
    id: randomUUID(),
    user_id: LOCAL_USER_ID,
    mastery: 0,
    created_at: now,
    updated_at: now,
    ...parsed,
  };

  db.prepare(
    `INSERT INTO learning_items
      (id, user_id, language, type, surface, reading, meaning, note, mastery, created_at, updated_at)
     VALUES (@id, @user_id, @language, @type, @surface, @reading, @meaning, @note, @mastery, @created_at, @updated_at)`,
  ).run({
    ...item,
    reading: item.reading ?? null,
    note: item.note ?? null,
  });

  return item;
}
