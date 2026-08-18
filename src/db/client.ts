import path from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "./schema.js";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "dev.db");

export function createDb(dbPath: string = DB_PATH): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}
