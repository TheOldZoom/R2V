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

    logger.debug({ executable }, "FFprobe instance created");
  }

  async probe(input: string): Promise<VideoMetadata> {
    logger.debug({ input }, "FFprobe.probe called");

    const parsed = await this.run(input);

    const videoStream = parsed.streams.find(
      (stream) => stream.codec_type === "video",
    );
    const audioStream = parsed.streams.find(
      (stream) => stream.codec_type === "audio",
    );

    logger.debug(
      {
        streamCount: parsed.streams.length,
        hasVideoStream: Boolean(videoStream),
        hasAudioStream: Boolean(audioStream),
      },
      "FFprobe stream detection",
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

    const metadata: VideoMetadata = {
      durationSeconds: duration,
      width: videoStream.width ?? 0,
      height: videoStream.height ?? 0,
      fps: parseFrameRate(videoStream.r_frame_rate),
      hasAudio: Boolean(audioStream),
    };

    logger.debug({ input, metadata }, "FFprobe.probe complete");

    return metadata;
  }

  async duration(input: string): Promise<number> {
    logger.debug({ input }, "FFprobe.duration called");

    const parsed = await this.run(input);

    const formatDuration = Number(parsed.format.duration ?? 0);

    if (Number.isFinite(formatDuration) && formatDuration > 0) {
      logger.debug(
        { input, duration: formatDuration, source: "format" },
        "FFprobe.duration resolved",
      );

      return formatDuration;
    }

    const streamDuration = parsed.streams
      .map((stream) => Number(stream.duration ?? 0))
      .find((value) => Number.isFinite(value) && value > 0);

    if (streamDuration === undefined) {
      logger.error(
        { input },
        "FFprobe could not determine duration from format or streams",
      );

      throw new Error(`Could not determine duration for: ${input}`);
    }

    logger.debug(
      { input, duration: streamDuration, source: "stream" },
      "FFprobe.duration resolved",
    );

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

    const startedAt = Date.now();

    const process = Bun.spawn([this.executable, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();
    const exitCode = await process.exited;

    logger.debug(
      {
        exitCode,
        durationMs: Date.now() - startedAt,
        stdoutBytes: stdout.length,
      },
      "FFprobe process exited",
    );

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
      const parsed = JSON.parse(stdout) as FFprobeOutput;

      logger.debug(
        { streamCount: parsed.streams?.length ?? 0 },
        "Parsed FFprobe JSON output",
      );

      return parsed;
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
