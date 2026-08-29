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
 * pair already relied on elsewhere.
 *
 * Every real call site wraps this in after() -- that is what makes it
 * "fire-and-forget" from the CALLER's response's point of view (the
 * response the current invocation owes its own caller is never delayed).
 * This function itself must therefore actually AWAIT the request being
 * genuinely dispatched rather than leaving it unawaited: after()'s own
 * lifetime-extension only covers the promise its callback returns -- an
 * unawaited fetch kicked off inside an after() callback races that
 * callback's own resolution, and the underlying function can be torn down
 * before the request ever leaves the process (confirmed live: the chain
 * never reached the route at all -- zero hits in Vercel's own runtime logs
 * across every request path in the window -- with the earlier
 * fire-and-forget version).
 *
 * The chained invocation's own real work (up to its own real ~220s budget)
 * must NOT be awaited here, though -- that would mean holding THIS
 * invocation's after() window open for up to that same ~220s on top of
 * whatever budget it already used, for no real benefit (the chained
 * invocation runs as a genuinely separate, independent function
 * invocation once dispatched; nothing here depends on its result). A short
 * real deadline is enough to know the request was actually sent -- a real
 * production request typically dispatches in well under a second; 5s is a
 * generous margin. Timing out here is expected and NOT a failure signal
 * (the server has almost certainly already accepted the request and moved
 * on to real work by then) -- only a genuine dispatch failure (DNS,
 * connection refused, etc.) is logged as one.
 */
export const MAX_PACKAGE_PRODUCER_CHAIN_DEPTH = 20;
const CHAIN_DISPATCH_TIMEOUT_MS = 5_000;

export async function chainPackageProducerIfMoreWorkRemains(depth: number): Promise<void> {
  if (depth >= MAX_PACKAGE_PRODUCER_CHAIN_DEPTH) {
    console.error(
      `package-producer chain: stopped at max depth (${MAX_PACKAGE_PRODUCER_CHAIN_DEPTH}) with real work still remaining -- the next scheduled cron tick (or a fresh activation) will continue it.`
    );
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // fails closed, matching the route's own auth check -- never chains an unauthenticated call
  const url = `${resolveCanonicalAppOrigin()}/api/social/package-producer`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "x-autopilot-chain-depth": String(depth + 1),
      },
      signal: AbortSignal.timeout(CHAIN_DISPATCH_TIMEOUT_MS),
    });
  } catch (err) {
    // A timeout here is the EXPECTED, successful case -- it means the real
    // chained invocation is still doing its own real work past our short
    // dispatch-confirmation window, not that dispatch failed.
    const isExpectedTimeout = err instanceof Error && err.name === "TimeoutError";
    if (!isExpectedTimeout) {
      console.error("package-producer chain: self-invoke failed to dispatch", err instanceof Error ? err.message : String(err));
    }
  }
}
