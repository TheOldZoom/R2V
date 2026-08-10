import { parseArgs } from "node:util";
import { config } from "./libs/config";
import { openDb } from "./libs/db";
import { createLLMProvider } from "./libs/llm";
import { logger } from "./libs/logger";
import { JobQueue } from "./libs/queue";
import { createTTSProvider } from "./libs/tts";
import { Worker } from "./libs/worker";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const db = await openDb();
  const queue = new JobQueue(db);

  switch (command) {
    case "enqueue":
      return runEnqueue(queue, rest);
    case "worker":
      return runWorker(queue, rest);
    case "status":
      return runStatus(queue, rest);
    case "history":
      return runHistory(queue, rest);
    default:
      printUsage();
      process.exitCode = command ? 1 : 0;
  }
}

function runEnqueue(queue: JobQueue, args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      count: { type: "string", default: "1" },
      "max-attempts": { type: "string" },
    },
  });

  const count = Number(values.count);

  if (!Number.isInteger(count) || count < 1) {
    logger.error(
      { count: values.count },
      "enqueue --count must be a positive integer",
    );
    process.exitCode = 1;
    return;
  }

  const maxAttempts = values["max-attempts"]
    ? Number(values["max-attempts"])
    : undefined;

  const jobs = queue.enqueueMany(count, { maxAttempts });

  console.log(`Enqueued ${jobs.length} job(s):`);
  for (const job of jobs) {
    console.log(`  ${job.id}`);
  }
}

async function runWorker(queue: JobQueue, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      concurrency: { type: "string", default: "1" },
      "poll-interval-ms": { type: "string" },
    },
  });

  logger.debug("Initializing LLM and TTS providers");

  const llm = createLLMProvider(config.llm);
  const tts = createTTSProvider(config.tts);

  const worker = new Worker(
    queue,
    { llm, tts },
    {
      concurrency: Number(values.concurrency),
      pollIntervalMs: values["poll-interval-ms"]
        ? Number(values["poll-interval-ms"])
        : undefined,
    },
  );

  await worker.run();
}

function runStatus(queue: JobQueue, args: string[]): void {
  const [jobId] = args;

  if (jobId) {
    const job = queue.getJob(jobId);

    if (!job) {
      console.log(`No job found with id ${jobId}`);
      process.exitCode = 1;
      return;
    }

    console.log(job);
    return;
  }

  for (const status of ["running", "queued", "failed"] as const) {
    const jobs = queue.listJobs({ status, limit: 20 });

    if (jobs.length === 0) {
      continue;
    }

    console.log(`\n${status.toUpperCase()} (${jobs.length})`);
    for (const job of jobs) {
      console.log(
        `  ${job.id}  attempts=${job.attempts}/${job.max_attempts}` +
          (job.error_stage ? `  failed-at=${job.error_stage}` : "") +
          (job.error ? `  error="${job.error}"` : ""),
      );
    }
  }
}

function runHistory(queue: JobQueue, args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { limit: { type: "string", default: "20" } },
  });

  const jobs = queue.listJobs({
    status: "succeeded",
    limit: Number(values.limit),
  });

  if (jobs.length === 0) {
    console.log("No completed videos yet.");
    return;
  }

  for (const job of jobs) {
    console.log(
      `${job.finished_at}  ${job.id}  "${job.title}"  ${job.duration_seconds?.toFixed(1)}s  -> ${job.output_path}`,
    );
  }
}

function printUsage(): void {
  console.log(`R2V job CLI

Usage:
  bun cli.ts enqueue [--count N] [--max-attempts N]
  bun cli.ts worker [--concurrency N] [--poll-interval-ms N]
  bun cli.ts status [jobId]
  bun cli.ts history [--limit N]
`);
}

main().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "CLI command failed",
  );
  process.exitCode = 1;
});
