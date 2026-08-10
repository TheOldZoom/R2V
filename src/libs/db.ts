import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "./logger";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRow {
  id: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_attempt_at: string | null;
  error: string | null;
  error_stage: string | null;
  reddit_post_id: string | null;
  reddit_subreddit: string | null;
  reddit_permalink: string | null;
  title: string | null;
  script_length: number | null;
  duration_seconds: number | null;
  output_path: string | null;
}

const DEFAULT_DB_PATH = process.env.R2V_DB_PATH ?? "output/r2v.sqlite3";

let db: Database | null = null;

export function getDb(path = DEFAULT_DB_PATH): Database {
  if (db) {
    return db;
  }

  logger.debug({ path }, "Opening R2V job database");

  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      next_attempt_at TEXT,
      error TEXT,
      error_stage TEXT,
      reddit_post_id TEXT,
      reddit_subreddit TEXT,
      reddit_permalink TEXT,
      title TEXT,
      script_length INTEGER,
      duration_seconds REAL,
      output_path TEXT
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_jobs_status_next_attempt ON jobs (status, next_attempt_at);`,
  );

  logger.debug("R2V job database ready");

  return db;
}

export async function openDb(path = DEFAULT_DB_PATH): Promise<Database> {
  await mkdir(dirname(path), { recursive: true });
  return getDb(path);
}

export function closeDb(): void {
  if (db) {
    logger.debug("Closing R2V job database");
    db.close();
    db = null;
  }
}
