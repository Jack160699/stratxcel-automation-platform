/**
 * Bounded exponential backoff for transactional email retries.
 * attempt 1 → +1 min, 2 → +5 min, 3 → +30 min, 4 → +2 hr, then terminal.
 */
const BACKOFF_SECONDS = [60, 300, 1800, 7200] as const;

export const EMAIL_MAX_ATTEMPTS = 5;

export function computeEmailBackoffSeconds(attemptCount: number): number {
  const index = Math.max(0, Math.min(attemptCount - 1, BACKOFF_SECONDS.length - 1));
  return BACKOFF_SECONDS[index];
}

export function nextEmailAttemptAt(attemptCount: number, now = new Date()): Date {
  const seconds = computeEmailBackoffSeconds(attemptCount);
  return new Date(now.getTime() + seconds * 1000);
}

export function isRetryExhausted(attemptCount: number, maxAttempts = EMAIL_MAX_ATTEMPTS): boolean {
  return attemptCount >= maxAttempts;
}
