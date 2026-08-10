import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import type { JobRow, JobStatus } from "./db";

export interface EnqueueOptions {
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;

export class JobQueue {
  constructor(private readonly db: Database) {}

  enqueue(options: EnqueueOptions = {}): JobRow {
    const id = randomUUID();
    const now = nowIso();
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    this.db
      .query(
        `INSERT INTO jobs (id, status, attempts, max_attempts, created_at, updated_at)
         VALUES (?, 'queued', 0, ?, ?, ?)`,
      )
      .run(id, maxAttempts, now, now);

    logger.info({ jobId: id, maxAttempts }, "Enqueued job");

    return this.getJob(id) as JobRow;
  }

  enqueueMany(count: number, options: EnqueueOptions = {}): JobRow[] {
    logger.info({ count }, "Enqueuing batch of jobs");
    return Array.from({ length: count }, () => this.enqueue(options));
  }

  claimNext(): JobRow | null {
    const now = nowIso();

    let claimed: JobRow | null = null;

    const tx = this.db.transaction(() => {
      const candidate = this.db
        .query<JobRow, [string]>(
          `SELECT * FROM jobs
           WHERE status = 'queued'
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY created_at ASC
           LIMIT 1`,
        )
        .get(now);

      if (!candidate) {
        return;
      }

      this.db
        .query(
          `UPDATE jobs
           SET status = 'running', attempts = attempts + 1,
               started_at = ?, updated_at = ?, error = NULL, error_stage = NULL
           WHERE id = ? AND status = 'queued'`,
        )
        .run(now, now, candidate.id);

      claimed = this.getJob(candidate.id);
    });

    tx();

    if (claimed) {
      logger.debug(
        {
          jobId: (claimed as JobRow).id,
          attempt: (claimed as JobRow).attempts,
        },
        "Claimed job",
      );
    }

    return claimed;
  }

  markSucceeded(
    jobId: string,
    result: {
      outputPath: string;
      title?: string;
      redditPostId?: string;
      redditSubreddit?: string;
      redditPermalink?: string;
      scriptLength?: number;
      durationSeconds?: number;
    },
  ): void {
    const now = nowIso();

    this.db
      .query(
        `UPDATE jobs
         SET status = 'succeeded', finished_at = ?, updated_at = ?,
             output_path = ?, title = ?, reddit_post_id = ?,
             reddit_subreddit = ?, reddit_permalink = ?,
             script_length = ?, duration_seconds = ?
         WHERE id = ?`,
      )
      .run(
        now,
        now,
        result.outputPath,
        result.title ?? null,
        result.redditPostId ?? null,
        result.redditSubreddit ?? null,
        result.redditPermalink ?? null,
        result.scriptLength ?? null,
        result.durationSeconds ?? null,
        jobId,
      );

    logger.info({ jobId, outputPath: result.outputPath }, "Job succeeded");
  }

  markFailed(jobId: string, error: unknown, stage?: string): void {
    const job = this.getJob(jobId);

    if (!job) {
      logger.warn({ jobId }, "markFailed called for unknown job");
      return;
    }

    const now = nowIso();
    const message = error instanceof Error ? error.message : String(error);
    const willRetry = job.attempts < job.max_attempts;

    if (willRetry) {
      const backoffMs = Math.min(
        RETRY_MAX_DELAY_MS,
        RETRY_BASE_DELAY_MS * 2 ** (job.attempts - 1),
      );
      const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

      this.db
        .query(
          `UPDATE jobs
           SET status = 'queued', updated_at = ?, next_attempt_at = ?,
               error = ?, error_stage = ?
           WHERE id = ?`,
        )
        .run(now, nextAttemptAt, message, stage ?? null, jobId);

      logger.warn(
        {
          jobId,
          attempt: job.attempts,
          maxAttempts: job.max_attempts,
          stage,
          backoffMs,
          error: message,
        },
        "Job failed, will retry",
      );
    } else {
      this.db
        .query(
          `UPDATE jobs
           SET status = 'failed', finished_at = ?, updated_at = ?,
               error = ?, error_stage = ?
           WHERE id = ?`,
        )
        .run(now, now, message, stage ?? null, jobId);

      logger.error(
        {
          jobId,
          attempt: job.attempts,
          maxAttempts: job.max_attempts,
          stage,
          error: message,
        },
        "Job failed permanently, no retries left",
      );
    }
  }

  getJob(jobId: string): JobRow | null {
    return this.db
      .query<JobRow, [string]>(`SELECT * FROM jobs WHERE id = ?`)
      .get(jobId);
  }

  listJobs(options: { status?: JobStatus; limit?: number } = {}): JobRow[] {
    const limit = options.limit ?? 20;

    if (options.status) {
      return this.db
        .query<
          JobRow,
          [string, number]
        >(`SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
        .all(options.status, limit);
    }

    return this.db
      .query<
        JobRow,
        [number]
      >(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit);
  }

  findStaleRunningJobs(): JobRow[] {
    return this.db
      .query<JobRow, []>(`SELECT * FROM jobs WHERE status = 'running'`)
      .all();
  }

  requeueStaleRunningJobs(): number {
    const stale = this.findStaleRunningJobs();

    for (const job of stale) {
      logger.warn(
        { jobId: job.id },
        "Requeuing job orphaned by crashed worker",
      );
      this.markFailed(
        job.id,
        new Error("Worker process exited unexpectedly"),
        "orphaned",
      );
    }

    return stale.length;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
