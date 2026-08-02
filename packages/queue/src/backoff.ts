/**
 * Mirrors queue_internal.compute_backoff_seconds exactly (base 30s,
 * doubling per attempt, capped at 1 hour) — kept in JS too so the admin
 * dashboard can display "next retry in ~Xs" without a round trip, and so
 * this formula is unit-testable without a live database. If this ever
 * drifts from the SQL version, retry-time displays would silently lie, so
 * the two must be changed together.
 */
export function computeBackoffSeconds(attemptCount: number): number {
  const exponent = Math.max(attemptCount - 1, 0);
  return Math.min(30 * 2 ** exponent, 3600);
}
