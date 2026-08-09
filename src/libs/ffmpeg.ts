import { logger } from "./logger";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface FFmpegInput {
  path: string;
  start?: number;
  duration?: number;
  loop?: boolean;
}

export interface FFmpegProgress {
  frame: number;
  fps: number;
  outTimeSeconds: number;
  speed: number;
}

export interface FFmpegOptions {
  inputs: FFmpegInput[];
  output: string;
  args?: string[];
  totalDurationSeconds?: number;
  onProgress?: (progress: FFmpegProgress, percent: number | null) => void;
}

export class FFmpeg {
  private readonly executable: string;

  constructor(executable = "ffmpeg") {
    this.executable = executable;

    logger.debug({ executable }, "FFmpeg instance created");
  }

  async run(options: FFmpegOptions): Promise<void> {
    const startedAt = Date.now();

    logger.debug(
      {
        inputCount: options.inputs.length,
        output: options.output,
        totalDurationSeconds: options.totalDurationSeconds,
      },
      "FFmpeg.run called",
    );

    if (options.inputs.length === 0) {
      throw new Error("FFmpeg.run requires at least one input");
    }

    for (const input of options.inputs) {
      const exists = await Bun.file(input.path).exists();

      logger.debug(
        { path: input.path, exists },
        "Checked FFmpeg input existence",
      );

      if (!exists) {
        throw new Error(`FFmpeg input not found: ${input.path}`);
      }
    }

    await mkdir(dirname(options.output), {
      recursive: true,
    });

    logger.debug(
      { dir: dirname(options.output) },
      "Ensured FFmpeg output directory exists",
    );

    const inputArgs = options.inputs.flatMap((input) => {
      const flags: string[] = [];

      if (input.loop) {
        flags.push("-stream_loop", "-1");
      }

      if (input.start !== undefined) {
        flags.push("-ss", String(input.start));
      }

      if (input.duration !== undefined) {
        flags.push("-t", String(input.duration));
      }

      flags.push("-i", input.path);

      return flags;
    });

    const args = [
      "-y",
      ...inputArgs,
      ...(options.args ?? []),
      "-progress",
      "pipe:1",
      "-nostats",
      options.output,
    ];

    logger.debug(
      {
        command: this.executable,
        args,
      },
      "Starting FFmpeg",
    );

    const process = Bun.spawn([this.executable, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    logger.debug({ pid: process.pid }, "FFmpeg process spawned");

    const stderrPromise = new Response(process.stderr).text();

    if (options.onProgress) {
      await this.readProgress(
        process.stdout,
        options.onProgress,
        options.totalDurationSeconds,
      );
    }

    const stderr = await stderrPromise;
    const exitCode = await process.exited;

    logger.debug(
      { exitCode, durationMs: Date.now() - startedAt },
      "FFmpeg process exited",
    );

    if (exitCode !== 0) {
      logger.error(
        {
          exitCode,
          stderr,
        },
        "FFmpeg process failed",
      );

      throw new Error(
        `FFmpeg exited with code ${exitCode}: ${lastLine(stderr)}`,
      );
    }

    logger.debug(
      { output: options.output, totalMs: Date.now() - startedAt },
      "FFmpeg process completed",
    );
  }

  private async readProgress(
    stdout: ReadableStream<Uint8Array>,
    onProgress: NonNullable<FFmpegOptions["onProgress"]>,
    totalDurationSeconds?: number,
  ): Promise<void> {
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fields: Record<string, string> = {};
    let updateCount = 0;

    logger.debug({ totalDurationSeconds }, "Starting FFmpeg progress reader");

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const [key, val] = line.split("=").map((part) => part.trim());

          if (!key || val === undefined) {
            continue;
          }

          fields[key] = val;

          if (key === "progress") {
            const progress = parseProgress(fields);
            const percent =
              totalDurationSeconds && totalDurationSeconds > 0
                ? Math.min(
                    100,
                    (progress.outTimeSeconds / totalDurationSeconds) * 100,
                  )
                : null;

            updateCount += 1;
            logger.debug(
              { progress, percent, updateCount },
              "FFmpeg progress update",
            );

            onProgress(progress, percent);
            fields = {};
          }
        }
      }
    } finally {
      reader.releaseLock();
      logger.debug({ updateCount }, "FFmpeg progress reader finished");
    }
  }
}

function parseProgress(fields: Record<string, string>): FFmpegProgress {
  const outTimeUs = Number(fields["out_time_us"] ?? 0);

  return {
    frame: Number(fields["frame"] ?? 0),
    fps: Number(fields["fps"] ?? 0),
    outTimeSeconds: outTimeUs > 0 ? outTimeUs / 1_000_000 : 0,
    speed: Number((fields["speed"] ?? "0x").replace("x", "")),
  };
}

function lastLine(text: string): string {
  const lines = text.trim().split("\n");

  return lines[lines.length - 1] ?? "";
}
