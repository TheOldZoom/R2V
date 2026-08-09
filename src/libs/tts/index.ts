import { TTSProvider, type R2VConfig } from "../config";
import { GeminiTTS } from "./gemini";
import { KokoroTTS } from "./kokoro";
import { logger } from "../logger";
import type { TTSProviderClient } from "./types";

export type { TTSGenerateOptions, TTSProviderClient, TTSResult } from "./types";

const DEFAULT_KOKORO_BASE_URL = "http://localhost:8880";

export function createTTSProvider(config: R2VConfig["tts"]): TTSProviderClient {
  const { provider, voice, apiKey, model, baseUrl } = config;

  logger.debug(
    { provider, voice, model, baseUrl, hasApiKey: Boolean(apiKey) },
    "Creating TTS provider",
  );

  switch (provider) {
    case TTSProvider.Gemini:
      if (!apiKey) {
        throw new Error(`Missing API key for TTS provider: ${provider}`);
      }

      return new GeminiTTS({ apiKey, voice, model });

    case TTSProvider.Kokoro:
      return new KokoroTTS({
        baseUrl: baseUrl ?? DEFAULT_KOKORO_BASE_URL,
        voice,
        model,
        apiKey,
      });

    default:
      throw new Error(`Unsupported TTS provider: ${provider}`);
  }
}
