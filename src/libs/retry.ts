import { logger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const label = options.label ?? "operation";

  let attempt = 0;

  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      const isRetryable = error instanceof RetryableError;

      if (!isRetryable || attempt >= maxRetries) {
        if (isRetryable) {
          logger.error(
            { label, attempt, maxRetries },
            "Retryable operation exhausted all retries",
          );
        }

        throw error;
      }

      const computedBackoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayBase = error.retryAfterMs ?? computedBackoff;
      const jitterMs = Math.random() * delayBase * 0.25;
      const delayMs = Math.min(maxDelayMs, Math.round(delayBase + jitterMs));

      attempt += 1;

      logger.warn(
        {
          label,
          attempt,
          maxRetries,
          delayMs,
          usedServerHint: error.retryAfterMs !== undefined,
          error: error.message,
        },
        "Retrying after rate limit / retryable error",
      );

      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
