import { ffprobe } from "../ffprobe";
import { isRetryableStatus, parseRetryAfterMs } from "../http-retry";
import { logger } from "../logger";
import { RetryableError, withRetry } from "../retry";
import { pcmToWav } from "./wav";
import type { TTSGenerateOptions, TTSProviderClient, TTSResult } from "./types";

export interface GeminiTTSOptions {
  apiKey: string;
  voice: string;
  model?: string;
  maxRetries?: number;
}

const DEFAULT_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_MAX_RETRIES = 5;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data: string;
          mimeType: string;
        };
      }>;
    };
  }>;
}

export class GeminiTTS implements TTSProviderClient {
  constructor(private readonly options: GeminiTTSOptions) {
    logger.debug(
      {
        voice: options.voice,
        model: options.model ?? DEFAULT_MODEL,
        maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      },
      "GeminiTTS initialized",
    );
  }

  async generate({ text, outputPath }: TTSGenerateOptions): Promise<TTSResult> {
    const startedAt = Date.now();

    if (!text.trim()) {
      throw new Error("GeminiTTS.generate called with empty text");
    }

    const model = this.options.model ?? DEFAULT_MODEL;
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;

    logger.debug(
      {
        outputPath,
        textLength: text.length,
        model,
        voice: this.options.voice,
      },
      "Generating Gemini TTS audio",
    );

    const audio = await withRetry(
      async (attempt) => {
        const requestStartedAt = Date.now();

        logger.debug(
          {
            attempt,
            model,
            voice: this.options.voice,
            textLength: text.length,
          },
          "Sending Gemini TTS request",
        );

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": this.options.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text }],
                },
              ],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: this.options.voice,
                    },
                  },
                },
              },
            }),
          },
        );

        logger.debug(
          {
            attempt,
            status: response.status,
            ok: response.ok,
            durationMs: Date.now() - requestStartedAt,
          },
          "Gemini TTS response received",
        );

        if (!response.ok) {
          const body = await response.text();

          logger.error(
            {
              attempt,
              status: response.status,
              body,
            },
            "Gemini TTS request failed",
          );

          const message = `Gemini TTS failed with status ${response.status}`;

          if (isRetryableStatus(response.status)) {
            throw new RetryableError(
              message,
              parseRetryAfterMs(response, body),
            );
          }

          throw new Error(message);
        }

        const result = (await response.json()) as GeminiGenerateContentResponse;

        const part = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;

        if (!part) {
          logger.error({ result }, "Gemini TTS returned no audio data");

          throw new Error("Gemini TTS returned no audio data");
        }

        const sampleRate = parseSampleRate(part.mimeType);
        const pcm = new Uint8Array(Buffer.from(part.data, "base64"));

        logger.debug(
          {
            mimeType: part.mimeType,
            sampleRate,
            pcmBytes: pcm.length,
            durationMs: Date.now() - requestStartedAt,
          },
          "Decoded Gemini TTS audio",
        );

        return {
          pcm,
          sampleRate,
        };
      },
      {
        label: "GeminiTTS",
        maxRetries,
      },
    );

    const wav = pcmToWav(audio.pcm, audio.sampleRate);

    await Bun.write(outputPath, wav);

    logger.debug(
      {
        outputPath,
        wavBytes: wav.length,
        sampleRate: audio.sampleRate,
      },
      "Wrote Gemini TTS WAV file",
    );

    const durationSeconds = await ffprobe.duration(outputPath);

    logger.debug(
      {
        outputPath,
        durationSeconds,
        totalMs: Date.now() - startedAt,
      },
      "Gemini TTS generated",
    );

    return {
      path: outputPath,
      durationSeconds,
    };
  }
}

function parseSampleRate(mimeType: string): number {
  const rate = mimeType.match(/rate=(\d+)/)?.[1];
  const sampleRate = rate ? Number(rate) : 24000;

  logger.debug(
    {
      mimeType,
      sampleRate,
    },
    "Parsed sample rate from mime type",
  );

  return sampleRate;
}
