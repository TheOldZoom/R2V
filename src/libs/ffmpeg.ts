import { logger } from "./logger";

export interface FFmpegOptions {
  input: string;
  output: string;
  args?: string[];
}

export class FFmpeg {
  private readonly executable: string;

  constructor(executable = "ffmpeg") {
    this.executable = executable;
  }

  async run(options: FFmpegOptions): Promise<void> {
    const args = [
      "-y",
      "-i",
      options.input,
      ...(options.args ?? []),
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

    const stderr = await new Response(process.stderr).text();
    const exitCode = await process.exited;

    if (exitCode !== 0) {
      logger.error(
        {
          exitCode,
          stderr,
        },
        "FFmpeg process failed",
      );

      throw new Error(`FFmpeg exited with code ${exitCode}`);
    }

    logger.debug("FFmpeg process completed");
  }
}
