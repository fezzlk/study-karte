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
      last_reviewed_at TEXT,
      next_review_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_events (
      id TEXT PRIMARY KEY,
      learning_item_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect', 'partial', 'self_known')),
      response_time_ms INTEGER,
      agent TEXT,
      quiz_type TEXT,
      mastery_before INTEGER NOT NULL,
      mastery_after INTEGER NOT NULL,
      next_review_at TEXT NOT NULL,
      FOREIGN KEY (learning_item_id) REFERENCES learning_items(id)
    );
  `);

  // Phase 0 databases may predate the review columns. SQLite does not support
  // ADD COLUMN IF NOT EXISTS, so inspect the table before applying migrations.
  const columns = new Set(
    (db.prepare("PRAGMA table_info(learning_items)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!columns.has("last_reviewed_at")) {
    db.exec("ALTER TABLE learning_items ADD COLUMN last_reviewed_at TEXT");
  }
  if (!columns.has("next_review_at")) {
    db.exec("ALTER TABLE learning_items ADD COLUMN next_review_at TEXT");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_items_due
      ON learning_items(user_id, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_review_events_item_reviewed
      ON review_events(learning_item_id, reviewed_at DESC);
  `);
}
