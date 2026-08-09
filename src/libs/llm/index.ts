import { LLMProvider, type R2VConfig } from "../config";
import { GeminiLLM } from "./gemini";
import { logger } from "../logger";
import type { LLMProviderClient } from "./types";

export type { LLMGenerateOptions, LLMProviderClient, LLMResult } from "./types";

export function createLLMProvider(config: R2VConfig["llm"]): LLMProviderClient {
  const { provider, model, apiKey } = config;

  logger.debug(
    { provider, model, hasApiKey: Boolean(apiKey) },
    "Creating LLM provider",
  );

  switch (provider) {
    case LLMProvider.Gemini:
      return new GeminiLLM({ apiKey, model });
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
