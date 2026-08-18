import type Database from "better-sqlite3";
import { z } from "zod";
import type { LearningItem } from "./addLearningItem.js";

export const searchLearningItemsInputShape = {
  language: z.string().optional().describe("対象言語で絞り込む（例: zh-CN）"),
  type: z.enum(["vocabulary", "phrase", "grammar"]).optional().describe("種別で絞り込む"),
  limit: z.number().int().positive().max(200).default(50).describe("取得件数上限"),
};

const searchLearningItemsInput = z.object(searchLearningItemsInputShape);

export type SearchLearningItemsInput = z.infer<typeof searchLearningItemsInput>;

export function searchLearningItems(db: Database.Database, input: SearchLearningItemsInput): LearningItem[] {
  const parsed = searchLearningItemsInput.parse(input);

  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit: parsed.limit };
  if (parsed.language) {
    conditions.push("language = @language");
    params.language = parsed.language;
  }
  if (parsed.type) {
    conditions.push("type = @type");
    params.type = parsed.type;
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(`SELECT * FROM learning_items ${where} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as LearningItem[];
}
