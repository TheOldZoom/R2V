export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function parseRetryAfterMs(
  response: Response,
  bodyText: string,
): number | undefined {
  const headerValue = response.headers.get("retry-after");

  if (headerValue) {
    const seconds = Number(headerValue);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { details?: Array<Record<string, unknown>> };
    };
    const details = parsed.error?.details ?? [];
    const retryInfo = details.find(
      (detail) =>
        detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    );
    const retryDelay = retryInfo?.["retryDelay"];

    if (typeof retryDelay === "string") {
      const match = retryDelay.match(/([\d.]+)s/);

      if (match) {
        return Number(match[1]) * 1000;
      }
    }
  } catch {}

  return undefined;
}
