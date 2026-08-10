import { cleanupJobTempDir, sweepOrphanedTempDirs } from "./cleanup";
import type { JobRow } from "./db";
import { PipelineStageError } from "./errors";
import { runJob, type JobRunnerDeps } from "./job-runner";
import { logger } from "./logger";
import type { JobQueue } from "./queue";

export interface WorkerOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export class Worker {
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private stopping = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly queue: JobQueue,
    private readonly deps: JobRunnerDeps,
    options: WorkerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async run(): Promise<void> {
    const requeued = this.queue.requeueStaleRunningJobs();
    const swept = await sweepOrphanedTempDirs(this.queue);

    logger.info(
      { concurrency: this.concurrency, requeued, sweptTempDirs: swept },
      "Worker starting",
    );

    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    while (!this.stopping) {
      this.fillSlots();

      if (this.inFlight.size >= this.concurrency) {
        await Promise.race(this.inFlight);
        continue;
      }

      await sleep(this.pollIntervalMs);
    }

    logger.info("Worker stopping, waiting for in-flight jobs to finish");
    await Promise.all(this.inFlight);
    logger.info("Worker stopped");
  }

  stop(): void {
    this.stopping = true;
  }

  private fillSlots(): void {
    while (this.inFlight.size < this.concurrency && !this.stopping) {
      const job = this.queue.claimNext();

      if (!job) {
        break;
      }

      const task = this.runOne(job).finally(() => {
        this.inFlight.delete(task);
      });

      this.inFlight.add(task);
    }
  }

  private async runOne(job: JobRow): Promise<void> {
    try {
      const result = await runJob(job, this.deps);
      this.queue.markSucceeded(job.id, result);
    } catch (error) {
      const stage =
        error instanceof PipelineStageError ? error.stage : undefined;
      const cause = error instanceof PipelineStageError ? error.cause : error;

      logger.error(
        {
          jobId: job.id,
          stage,
          error: cause instanceof Error ? cause.message : String(cause),
        },
        "Job run threw an error",
      );

      this.queue.markFailed(job.id, error, stage);
    } finally {
      await cleanupJobTempDir(job.id);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
