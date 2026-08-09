import { isRetryableStatus, parseRetryAfterMs } from "../http-retry";
import { logger } from "../logger";
import { RetryableError, withRetry } from "../retry";
import type { LLMGenerateOptions, LLMProviderClient, LLMResult } from "./types";

export interface GeminiLLMOptions {
  apiKey: string;
  model: string;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 5;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class GeminiLLM implements LLMProviderClient {
  constructor(private readonly options: GeminiLLMOptions) {
    logger.debug({ model: options.model }, "GeminiLLM initialized");
  }

  async generate({
    prompt,
    systemPrompt,
  }: LLMGenerateOptions): Promise<LLMResult> {
    const { apiKey, model } = this.options;
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const startedAt = Date.now();

    logger.debug(
      {
        model,
        promptLength: prompt.length,
        hasSystemPrompt: Boolean(systemPrompt),
        systemPromptLength: systemPrompt?.length ?? 0,
      },
      "Sending Gemini LLM request",
    );

    const result = await withRetry(
      async (attempt) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              ...(systemPrompt
                ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
                : {}),
            }),
          },
        );

        logger.debug(
          {
            attempt,
            status: response.status,
            ok: response.ok,
            durationMs: Date.now() - startedAt,
          },
          "Gemini LLM response received",
        );

        if (!response.ok) {
          const body = await response.text();

          logger.error(
            { attempt, status: response.status, body },
            "Gemini LLM request failed",
          );

          const message = `Gemini LLM failed with status ${response.status}`;

          if (isRetryableStatus(response.status)) {
            throw new RetryableError(
              message,
              parseRetryAfterMs(response, body),
            );
          }

          throw new Error(message);
        }

        return (await response.json()) as GeminiGenerateContentResponse;
      },
      { label: "GeminiLLM.generate", maxRetries },
    );

    logger.debug(
      { candidateCount: result.candidates?.length ?? 0 },
      "Gemini LLM response parsed",
    );

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logger.error({ result }, "Gemini LLM returned no text");

      throw new Error("Gemini LLM returned no text");
    }

    logger.debug(
      { textLength: text.length, totalMs: Date.now() - startedAt },
      "Gemini LLM generation complete",
    );

    return { text };
  }
}
