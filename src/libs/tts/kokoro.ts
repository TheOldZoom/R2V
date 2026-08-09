import { ffprobe } from "../ffprobe";
import { isRetryableStatus, parseRetryAfterMs } from "../http-retry";
import { logger } from "../logger";
import { RetryableError, withRetry } from "../retry";
import type { TTSGenerateOptions, TTSProviderClient, TTSResult } from "./types";

export type KokoroResponseFormat =
  | "wav"
  | "mp3"
  | "flac"
  | "opus"
  | "aac"
  | "pcm";

export interface KokoroTTSOptions {
  baseUrl: string;
  voice: string;
  model?: string;
  apiKey?: string;
  responseFormat?: KokoroResponseFormat;
  maxRetries?: number;
}

const DEFAULT_MODEL = "kokoro";
const DEFAULT_RESPONSE_FORMAT: KokoroResponseFormat = "wav";
const DEFAULT_MAX_RETRIES = 3;

export class KokoroTTS implements TTSProviderClient {
  constructor(private readonly options: KokoroTTSOptions) {
    logger.debug(
      {
        baseUrl: options.baseUrl,
        voice: options.voice,
        model: options.model ?? DEFAULT_MODEL,
        responseFormat: options.responseFormat ?? DEFAULT_RESPONSE_FORMAT,
      },
      "KokoroTTS initialized",
    );
  }

  async generate({ text, outputPath }: TTSGenerateOptions): Promise<TTSResult> {
    const startedAt = Date.now();
    const {
      baseUrl,
      voice,
      apiKey,
      model = DEFAULT_MODEL,
      responseFormat = DEFAULT_RESPONSE_FORMAT,
    } = this.options;
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/audio/speech`;

    logger.debug(
      {
        url,
        voice,
        model,
        responseFormat,
        textLength: text.length,
        outputPath,
      },
      "Sending Kokoro TTS request",
    );

    const audioBytes = await withRetry(
      async (attempt) => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            voice,
            input: text,
            response_format: responseFormat,
          }),
        });

        logger.debug(
          {
            attempt,
            status: response.status,
            ok: response.ok,
            durationMs: Date.now() - startedAt,
          },
          "Kokoro TTS response received",
        );

        if (!response.ok) {
          const body = await response.text();

          logger.error(
            { attempt, status: response.status, body },
            "Kokoro TTS request failed",
          );

          const message = `Kokoro TTS failed with status ${response.status}`;

          if (isRetryableStatus(response.status)) {
            throw new RetryableError(
              message,
              parseRetryAfterMs(response, body),
            );
          }

          throw new Error(message);
        }

        return new Uint8Array(await response.arrayBuffer());
      },
      { label: "KokoroTTS.generate", maxRetries },
    );

    logger.debug(
      { outputPath, audioBytes: audioBytes.length },
      "Received Kokoro TTS audio",
    );

    await Bun.write(outputPath, audioBytes);

    logger.debug({ outputPath }, "Wrote Kokoro TTS audio file");

    const durationSeconds = await ffprobe.duration(outputPath);

    logger.debug(
      { outputPath, durationSeconds, totalMs: Date.now() - startedAt },
      "Kokoro TTS generated",
    );

    return { path: outputPath, durationSeconds };
  }
}
