import type Database from "better-sqlite3";

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      language TEXT NOT NULL,
      type TEXT NOT NULL,
      surface TEXT NOT NULL,
      reading TEXT,
      meaning TEXT NOT NULL,
      note TEXT,
      mastery INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
