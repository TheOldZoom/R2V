import { config } from "./config";
import type { FFmpeg, FFmpegInput, FFmpegProgress } from "./ffmpeg";
import { ffprobe } from "./ffprobe";
import { logger } from "./logger";

export interface RenderOptions {
  backgroundVideo: string;
  audio?: string;
  output: string;
  trim?: {
    start?: number;
    duration?: number;
  };
  fit?: "cover" | "stretch";
  onProgress?: (progress: FFmpegProgress, percent: number | null) => void;
}

export interface RenderMetadata {
  output: string;
  backgroundVideo: string;
  audio?: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  createdAt: string;
}

const PROGRESS_LOG_STEP = 10;

export class VideoRenderer {
  constructor(private readonly ffmpeg: FFmpeg) {}

  async render(options: RenderOptions): Promise<RenderMetadata> {
    const { width, height, fps } = config.video;
    const fit = options.fit ?? "cover";

    for (const path of [options.backgroundVideo, options.audio].filter(
      (value): value is string => Boolean(value),
    )) {
      const exists = await Bun.file(path).exists();

      if (!exists) {
        throw new Error(`Render input not found: ${path}`);
      }
    }

    const backgroundMeta = await ffprobe.probe(options.backgroundVideo);
    const backgroundStart = options.trim?.start ?? 0;
    const backgroundAvailable =
      options.trim?.duration ??
      backgroundMeta.durationSeconds - backgroundStart;

    if (backgroundAvailable <= 0) {
      throw new Error(
        `Trim leaves no usable background video: ${options.backgroundVideo}`,
      );
    }

    const targetDuration = options.audio
      ? await ffprobe.duration(options.audio)
      : backgroundAvailable;

    const needsLoop = targetDuration > backgroundAvailable;

    logger.debug(
      {
        background: options.backgroundVideo,
        audio: options.audio,
        targetDuration,
        backgroundAvailable,
        looping: needsLoop,
        fit,
      },
      "Preparing render",
    );

    const inputs: FFmpegInput[] = [
      {
        path: options.backgroundVideo,
        start: backgroundStart,
        duration: targetDuration,
        loop: needsLoop,
      },
    ];

    if (options.audio) {
      inputs.push({ path: options.audio });
    }

    const scaleFilter =
      fit === "cover"
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}`;

    const args = ["-vf", scaleFilter];

    if (options.audio) {
      args.push("-map", "0:v:0", "-map", "1:a:0");
    } else if (backgroundMeta.hasAudio) {
      args.push("-map", "0:v:0", "-map", "0:a:0");
    } else {
      args.push("-map", "0:v:0");
    }

    args.push(
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
    );

    let lastLoggedStep = -1;

    try {
      await this.ffmpeg.run({
        inputs,
        output: options.output,
        args,
        totalDurationSeconds: targetDuration,
        onProgress: (progress, percent) => {
          if (percent !== null) {
            const step = Math.floor(percent / PROGRESS_LOG_STEP);

            if (step > lastLoggedStep) {
              lastLoggedStep = step;
              logger.info(
                { percent: Math.round(percent), speed: progress.speed },
                "Render progress",
              );
            }
          }

          options.onProgress?.(progress, percent);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(
        `Render failed for output ${options.output} (background: ${options.backgroundVideo}${
          options.audio ? `, audio: ${options.audio}` : ""
        }): ${message}`,
      );
    }

    const metadata: RenderMetadata = {
      output: options.output,
      backgroundVideo: options.backgroundVideo,
      audio: options.audio,
      width,
      height,
      fps,
      durationSeconds: targetDuration,
      createdAt: new Date().toISOString(),
    };

    await Bun.write(
      `${options.output}.json`,
      JSON.stringify(metadata, null, 2),
    );

    logger.info({ output: options.output }, "Render complete");

    return metadata;
  }
}
