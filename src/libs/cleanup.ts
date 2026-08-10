import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "./logger";
import type { JobQueue } from "./queue";

const DEFAULT_TMP_ROOT = "output/tmp";

export function tempDirForJob(jobId: string, root = DEFAULT_TMP_ROOT): string {
  return join(root, jobId);
}

export async function cleanupJobTempDir(
  jobId: string,
  root = DEFAULT_TMP_ROOT,
): Promise<void> {
  const dir = tempDirForJob(jobId, root);

  try {
    await rm(dir, { recursive: true, force: true });
    logger.debug({ jobId, dir }, "Cleaned up job temp directory");
  } catch (error) {
    logger.warn(
      {
        jobId,
        dir,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to clean up job temp directory",
    );
  }
}

export async function sweepOrphanedTempDirs(
  queue: JobQueue,
  root = DEFAULT_TMP_ROOT,
): Promise<number> {
  let entries: string[];

  try {
    entries = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }

    logger.warn(
      { root, error: error instanceof Error ? error.message : String(error) },
      "Could not read temp root while sweeping orphaned dirs",
    );
    return 0;
  }

  const runningIds = new Set(queue.findStaleRunningJobs().map((job) => job.id));

  let removed = 0;

  for (const entry of entries) {
    if (runningIds.has(entry)) {
      continue;
    }

    await rm(join(root, entry), { recursive: true, force: true });
    removed += 1;
  }

  if (removed > 0) {
    logger.info({ removed }, "Swept orphaned temp directories");
  }

  return removed;
}
