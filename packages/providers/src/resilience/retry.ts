/**
 * Provider Resilience: Retries, Exponential Backoff, & Timeouts
 */

import { ProviderError } from "./errors.ts";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function withResilience<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const initialDelay = options.initialDelayMs ?? 100;
  const maxDelay = options.maxDelayMs ?? 1000;
  const factor = options.backoffFactor ?? 2;
  const timeoutMs = options.timeoutMs ?? 15000;

  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ProviderError({
                message: `Operation timed out after ${timeoutMs}ms`,
                code: "TIMEOUT",
                provider: "internal",
                capability: "resilience",
              })
            ),
          timeoutMs
        )
      );

      return await Promise.race([fn(), timeoutPromise]);
    } catch (err: unknown) {
      attempt++;
      const isRetryable =
        options.shouldRetry?.(err) ??
        (err instanceof ProviderError
          ? err.isRetryable
          : (err as any)?.code === "ECONNRESET" || (err as any)?.code === "ETIMEDOUT");

      if (attempt > maxRetries || !isRetryable) {
        throw err;
      }

      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }
}
