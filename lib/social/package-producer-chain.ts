import { resolveCanonicalAppOrigin } from "@stratxcel/email-runtime";

/**
 * Mission E Section 18: the Vercel Hobby plan permits at most one
 * vercel.json-DECLARED cron invocation per day per route -- a real,
 * external, billing-tier constraint (confirmed live in Mission D+ via the
 * Vercel API's own `cron_jobs_limits_reached` error). That limit applies
 * only to declared cron schedules, not to an ordinary authenticated HTTP
 * request the app makes to its own deployed route -- so a route that still
 * has real, bounded work left after its own invocation's time budget runs
 * out can trigger a genuinely NEW invocation of itself (a fresh real
 * maxDuration budget), using the exact same CRON_SECRET bearer auth the
 * route already requires of every caller, cron or otherwise. This is what
 * lets a campaign make continuous forward progress through a single daily
 * cron tick (or a payment/OAuth activation) instead of stalling for up to
 * 24h between bounded batches -- zero new infrastructure, no subscription
 * to a paid queue/webhook service, nothing beyond what's already deployed.
 *
 * Depth-bounded so a bug can never turn this into a runaway invocation
 * loop -- if depth is exhausted with real work still remaining, this logs
 * it and stops; the next scheduled cron tick (or a fresh activation) picks
 * up exactly where this chain left off, since every step here is the same
 * idempotent, resumable planPackagePeriod/prepareNearTermPackageItems
 * pair already relied on elsewhere. Always fire-and-forget (never
 * awaited) -- this must never delay or fail the response the CURRENT
 * invocation already owes its own caller.
 */
export const MAX_PACKAGE_PRODUCER_CHAIN_DEPTH = 20;

export function chainPackageProducerIfMoreWorkRemains(depth: number): void {
  if (depth >= MAX_PACKAGE_PRODUCER_CHAIN_DEPTH) {
    console.error(
      `package-producer chain: stopped at max depth (${MAX_PACKAGE_PRODUCER_CHAIN_DEPTH}) with real work still remaining -- the next scheduled cron tick (or a fresh activation) will continue it.`
    );
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // fails closed, matching the route's own auth check -- never chains an unauthenticated call
  const url = `${resolveCanonicalAppOrigin()}/api/social/package-producer`;
  fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "x-autopilot-chain-depth": String(depth + 1),
    },
  }).catch((err) => {
    console.error("package-producer chain: self-invoke failed", err instanceof Error ? err.message : String(err));
  });
}
