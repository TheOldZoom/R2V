import { logger } from "./logger";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

interface FFprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}

interface FFprobeFormat {
  duration?: string;
}

interface FFprobeOutput {
  streams: FFprobeStream[];
  format: FFprobeFormat;
}

export class FFprobe {
  private readonly executable: string;

  constructor(executable = "ffprobe") {
    this.executable = executable;
  }

  async probe(input: string): Promise<VideoMetadata> {
    const parsed = await this.run(input);

    const videoStream = parsed.streams.find(
      (stream) => stream.codec_type === "video",
    );
    const audioStream = parsed.streams.find(
      (stream) => stream.codec_type === "audio",
    );

    if (!videoStream) {
      throw new Error(`No video stream found in: ${input}`);
    }

    const duration = Number(
      videoStream.duration ?? parsed.format.duration ?? 0,
    );

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Could not determine duration for: ${input}`);
    }

    return {
      durationSeconds: duration,
      width: videoStream.width ?? 0,
      height: videoStream.height ?? 0,
      fps: parseFrameRate(videoStream.r_frame_rate),
      hasAudio: Boolean(audioStream),
    };
  }

  async duration(input: string): Promise<number> {
    const parsed = await this.run(input);

    const formatDuration = Number(parsed.format.duration ?? 0);

    if (Number.isFinite(formatDuration) && formatDuration > 0) {
      return formatDuration;
    }

    const streamDuration = parsed.streams
      .map((stream) => Number(stream.duration ?? 0))
      .find((value) => Number.isFinite(value) && value > 0);

    if (streamDuration === undefined) {
      throw new Error(`Could not determine duration for: ${input}`);
    }

    return streamDuration;
  }

  private async run(input: string): Promise<FFprobeOutput> {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      input,
    ];

    logger.debug(
      {
        command: this.executable,
        args,
      },
      "Starting FFprobe",
    );

    const process = Bun.spawn([this.executable, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();
    const exitCode = await process.exited;

    if (exitCode !== 0) {
      logger.error(
        {
          exitCode,
          stderr,
        },
        "FFprobe process failed",
      );

      throw new Error(`FFprobe exited with code ${exitCode} for: ${input}`);
    }

    try {
      return JSON.parse(stdout) as FFprobeOutput;
    } catch (error) {
      logger.error(
        {
          stdout,
        },
        "Failed to parse FFprobe output",
      );

      throw new Error(`Failed to parse FFprobe output as JSON for: ${input}`);
    }
  }
}

function parseFrameRate(rate: string | undefined): number {
  if (!rate) {
    return 0;
  }

  const [numerator, denominator] = rate.split("/").map(Number);

  if (!numerator || !denominator) {
    return 0;
  }

  return numerator / denominator;
}

export const ffprobe = new FFprobe();
