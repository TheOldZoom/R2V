import { config } from "./config";
import { dirname } from "node:path";
import type { FFmpeg, FFmpegInput, FFmpegProgress } from "./ffmpeg";
import { ffprobe } from "./ffprobe";
import { logger } from "./logger";

export interface RenderOptions {
  backgroundVideo: string;
  audio?: string;
  music?: string;
  musicVolume?: number;
  captions?: string;
  captionFontFile?: string;
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
  music?: string;
  captions?: string;
  captionFontFile?: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  createdAt: string;
}

const PROGRESS_LOG_STEP = 10;
const DEFAULT_MUSIC_VOLUME = 0.08;

export class VideoRenderer {
  constructor(private readonly ffmpeg: FFmpeg) {
    logger.debug("VideoRenderer instance created");
  }

  async render(options: RenderOptions): Promise<RenderMetadata> {
    const startedAt = Date.now();
    const { width, height, fps } = config.video;
    const fit = options.fit ?? "cover";

    logger.debug(
      {
        backgroundVideo: options.backgroundVideo,
        audio: options.audio,
        music: options.music,
        captions: options.captions,
        captionFontFile: options.captionFontFile,
        musicVolume: options.musicVolume ?? DEFAULT_MUSIC_VOLUME,
        output: options.output,
        trim: options.trim,
        fit,
        video: { width, height, fps },
      },
      "VideoRenderer.render called",
    );

    for (const path of [
      options.backgroundVideo,
      options.audio,
      options.music,
      options.captions,
      options.captionFontFile,
    ].filter((value): value is string => Boolean(value))) {
      const exists = await Bun.file(path).exists();

      logger.debug({ path, exists }, "Checked render input existence");

      if (!exists) {
        throw new Error(`Render input not found: ${path}`);
      }
    }

    const backgroundMeta = await ffprobe.probe(options.backgroundVideo);

    logger.debug({ backgroundMeta }, "Probed background video metadata");

    const backgroundStart = options.trim?.start ?? 0;
    const backgroundAvailable =
      options.trim?.duration ??
      backgroundMeta.durationSeconds - backgroundStart;

    logger.debug(
      { backgroundStart, backgroundAvailable },
      "Computed background trim window",
    );

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

    let audioInputIndex: number | null = null;
    let musicInputIndex: number | null = null;

    if (options.audio) {
      inputs.push({ path: options.audio });
      audioInputIndex = inputs.length - 1;
    }

    if (options.music) {
      inputs.push({
        path: options.music,
        loop: true,
        duration: targetDuration,
      });
      musicInputIndex = inputs.length - 1;
    }

    const scaleFilter =
      fit === "cover"
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}`;
    const subtitleFilter = options.captions
      ? [
          `filename='${escapeSubtitlePath(options.captions)}'`,
          ...(options.captionFontFile
            ? [
                `fontsdir='${escapeSubtitlePath(dirname(options.captionFontFile))}'`,
              ]
            : []),
        ].join(":")
      : null;
    const videoFilter = subtitleFilter
      ? `${scaleFilter},subtitles=${subtitleFilter}`
      : scaleFilter;

    logger.debug({ videoFilter, fit }, "Computed video filter");

    const musicVolume = options.musicVolume ?? DEFAULT_MUSIC_VOLUME;
    const args: string[] = [];

    if (musicInputIndex !== null) {
      const filterComplex = [`[0:v]${videoFilter}[vout]`];
      let audioMapLabel: string;

      if (audioInputIndex !== null) {
        filterComplex.push(
          `[${musicInputIndex}:a]volume=${musicVolume}[music]`,
        );
        filterComplex.push(
          `[${audioInputIndex}:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
        );
        audioMapLabel = "[aout]";
      } else if (backgroundMeta.hasAudio) {
        filterComplex.push(
          `[${musicInputIndex}:a]volume=${musicVolume}[music]`,
        );
        filterComplex.push(
          `[0:a][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
        );
        audioMapLabel = "[aout]";
      } else {
        filterComplex.push(`[${musicInputIndex}:a]volume=${musicVolume}[aout]`);
        audioMapLabel = "[aout]";
      }

      args.push(
        "-filter_complex",
        filterComplex.join(";"),
        "-map",
        "[vout]",
        "-map",
        audioMapLabel,
      );
    } else {
      args.push("-vf", videoFilter);

      if (audioInputIndex !== null) {
        args.push("-map", "0:v:0", "-map", `${audioInputIndex}:a:0`);
      } else if (backgroundMeta.hasAudio) {
        args.push("-map", "0:v:0", "-map", "0:a:0");
      } else {
        args.push("-map", "0:v:0");
      }
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

    logger.debug({ args, musicVolume }, "Computed FFmpeg render args");

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

      logger.error(
        { error: message, output: options.output },
        "VideoRenderer.render failed",
      );

      throw new Error(
        `Render failed for output ${options.output} (background: ${options.backgroundVideo}${
          options.audio ? `, audio: ${options.audio}` : ""
        }${options.music ? `, music: ${options.music}` : ""}): ${message}`,
      );
    }

    const metadata: RenderMetadata = {
      output: options.output,
      backgroundVideo: options.backgroundVideo,
      audio: options.audio,
      music: options.music,
      captions: options.captions,
      captionFontFile: options.captionFontFile,
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

    logger.debug(
      { metadataPath: `${options.output}.json` },
      "Wrote render metadata file",
    );

    logger.info(
      { output: options.output, totalMs: Date.now() - startedAt },
      "Render complete",
    );

    return metadata;
  }
}

function escapeSubtitlePath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
