// Run with: node --experimental-strip-types lib/social/__tests__/resumable-orchestration.test.ts
//
// Mission E: the remaining problem after Mission D+ was throughput, not
// correctness -- NET_NEW_AI's real ~150-160s/item cost meant a single
// invocation (whether the daily cron, an admin click, or a payment
// activation) could only ever make a small, bounded amount of real
// progress before either running out of its own maxDuration budget (and
// getting killed mid-flight -- the exact failure Mission D+'s stale-job
// self-heal was built for) or simply stopping and waiting for whatever
// happened to trigger it again. On Vercel Hobby (one declared cron/day),
// that meant the campaign could stall for up to 24h between bounded
// batches with no way to make forward progress in between, and the
// mission's own core requirement -- no repeated manual admin action --
// was still unmet.
//
// This proves, from source:
//  - every invocation that can process MULTIPLE items (or authorizations)
//    respects ONE shared time budget, not a fresh one per item/authorization,
//  - work already in flight is always allowed to finish; only a NOT-YET-
//    STARTED item/authorization is ever skipped when the budget is gone,
//  - a real, accurate (not heuristic) signal reports whether eligible work
//    remains beyond what this invocation reached,
//  - that signal drives a real self-chained follow-up invocation via a
//    plain authenticated HTTP call to the app's own deployed route (zero
//    new infrastructure, no paid queue service) -- bounded by a real
//    max-depth so a bug can never become a runaway invocation loop,
//  - both real activation entry points (payment/OAuth-triggered
//    attemptAutoActivatePackageAutopilot, and the manual activate/resume
//    route) trigger this same chain, not a duplicate one,
//  - the chain is fire-and-forget via after(), so it can never delay or
//    fail the response the current invocation owes its own caller.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const packageAutopilot = read("lib", "social", "package-autopilot.ts");
  const packageProducer = read("lib", "social", "package-producer.ts");
  const chainHelper = read("lib", "social", "package-producer-chain.ts");
  const producerRoute = read("app", "api", "social", "package-producer", "route.ts");
  const activateRoute = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const adminActions = read("app", "admin", "(shell)", "social", "actions.ts");

  // --- prepareNearTermPackageItems: real, bounded, deadline-aware --------
  const prepareStart = packageAutopilot.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = packageAutopilot.indexOf("\nexport async function", prepareStart + 50);
  const prepareBody = packageAutopilot.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);
  assert.match(prepareBody, /options\?:\s*\{\s*deadlineMs\?:\s*number\s*\}/, "must accept an optional explicit deadline so a caller processing multiple authorizations can share ONE real budget");
  assert.match(prepareBody, /if \(Date\.now\(\) >= deadline\) \{/, "must check the deadline before starting a new item");
  // The check must be BEFORE the try block that does the real generation
  // work, not after -- an item already in flight must always be allowed to
  // finish (never killed mid-write, the exact Mission D+ failure mode).
  // Scoped to the real per-item loop specifically (searching for "try {"
  // from the loop's own start, not the whole function body) -- the
  // function legitimately has other real try/catch blocks BEFORE the
  // per-item loop today (e.g. the canonical-context assembly try/catch,
  // strictly additive batch-level observability), which is fine and
  // doesn't interrupt anything already in flight; a naive "first try{
  // anywhere in the function" search would incorrectly flag those.
  const perItemLoopIndex = prepareBody.indexOf("for (const raw of dueItems");
  assert.ok(perItemLoopIndex >= 0, "must find the real per-item loop");
  const deadlineCheckIndex = prepareBody.indexOf("if (Date.now() >= deadline)", perItemLoopIndex);
  const firstTryIndexInLoop = prepareBody.indexOf("try {", perItemLoopIndex);
  assert.ok(deadlineCheckIndex >= perItemLoopIndex && deadlineCheckIndex < firstTryIndexInLoop, "the deadline check must run before any per-item work starts, never interrupt work already begun");
  assert.match(prepareBody, /moreWorkRemaining/, "must return a real signal for whether eligible work remains beyond this call");
  assert.match(prepareBody, /count:\s*"exact",\s*head:\s*true/, "the remaining-work signal must be a real count query, not a heuristic guess");
  console.log("prepareNearTermPackageItems: real deadline-aware, in-flight-safe, accurately reports remaining work — PASS");

  // --- runPackageAutopilotProducer: ONE shared deadline across every
  //     authorization, not a fresh one each time -----------------------
  assert.match(packageProducer, /const sharedDeadline = started \+ PRODUCER_BUDGET_MS/, "the deadline must be computed once, shared across the whole invocation");
  assert.match(packageProducer, /if \(Date\.now\(\) >= sharedDeadline\) \{[\s\S]{0,80}moreWorkRemaining = true;[\s\S]{0,20}break;/, "must stop starting new authorizations once the shared budget is gone, and report that real work remains");
  assert.match(packageProducer, /prepareNearTermPackageItems\(service, authorization\.id, \{ deadlineMs: sharedDeadline \}\)/, "must pass the SAME shared deadline down, not let each authorization claim its own fresh budget");
  assert.match(packageProducer, /moreWorkRemaining: boolean/, "the aggregate result must carry the real remaining-work signal");
  console.log("runPackageAutopilotProducer: one real shared budget across every authorization this invocation touches — PASS");

  // --- The self-chain helper: real, bounded, fail-closed, GENUINELY
  //     dispatched (real bug found live: an unawaited fetch kicked off
  //     inside an after() callback races that callback's own resolution --
  //     the underlying function can be torn down before the request ever
  //     leaves the process. Confirmed live: zero hits reached the route in
  //     Vercel's own runtime logs across every request path in the window,
  //     with the earlier fire-and-forget version. Must genuinely await
  //     dispatch, bounded by a short real timeout so it never waits for
  //     the CHAINED invocation's own full ~130s of real work.) -----------
  assert.match(chainHelper, /MAX_PACKAGE_PRODUCER_CHAIN_DEPTH/, "must have a real, finite depth bound -- never an unbounded chain");
  assert.match(chainHelper, /if \(depth >= MAX_PACKAGE_PRODUCER_CHAIN_DEPTH\)/, "must actually stop at the bound, not just define it");
  assert.match(chainHelper, /const secret = process\.env\.CRON_SECRET;\s*\n\s*if \(!secret\) return;/, "must fail closed exactly like the route's own auth check -- never chains an unauthenticated call");
  assert.match(chainHelper, /authorization:\s*`Bearer \$\{secret\}`/, "must use the same real CRON_SECRET bearer auth the route already requires of every caller");
  assert.match(chainHelper, /"x-autopilot-chain-depth":\s*String\(depth \+ 1\)/, "must increment the depth on every hop, or the bound above is meaningless");
  assert.match(chainHelper, /export async function chainPackageProducerIfMoreWorkRemains/, "must be async so a caller inside after() can genuinely await dispatch");
  assert.match(chainHelper, /await fetch\(url,/, "must actually await the fetch -- an unawaited fetch inside an after() callback can be torn down before it ever leaves the process");
  assert.match(chainHelper, /signal:\s*AbortSignal\.timeout\(CHAIN_DISPATCH_TIMEOUT_MS\)/, "must bound the await with a short real timeout -- must never wait for the chained invocation's own full ~130s of real work, only that dispatch happened");
  console.log("package-producer-chain.ts: bounded, fail-closed, correctly authenticated, genuinely dispatches (bounded await, not fire-and-forget) — PASS");

  // --- The cron/producer route: chains via after() (never delays its own
  //     response), genuinely awaits dispatch, reads the real incoming
  //     depth header --------------------------------------------------
  assert.match(producerRoute, /import \{ NextResponse, after, type NextRequest \} from "next\/server"/, "must import after() to chain without delaying the response");
  assert.match(producerRoute, /if \(result\.moreWorkRemaining\) \{[\s\S]{0,250}after\(async \(\) => \{[\s\S]{0,80}await chainPackageProducerIfMoreWorkRemains\(depth\);/, "must chain via after() and genuinely AWAIT the chain call inside it -- an unawaited call races after()'s own resolution and can be torn down before dispatch");
  assert.match(producerRoute, /req\.headers\.get\("x-autopilot-chain-depth"\)/, "must read the real incoming depth so the bound is enforced across the whole chain, not reset every hop");
  console.log("api/social/package-producer/route.ts: chains in the background via after(), genuinely awaits dispatch, respects the real incoming depth — PASS");

  // --- Both real activation entry points trigger the SAME chain helper,
  //     not a duplicate implementation ------------------------------------
  const autoActivateStart = packageAutopilot.indexOf("export async function attemptAutoActivatePackageAutopilot");
  const autoActivateBody = packageAutopilot.slice(autoActivateStart, packageAutopilot.indexOf("\nasync function validatePackageResumePrerequisites", autoActivateStart));
  assert.match(autoActivateBody, /prepareResult\.moreWorkRemaining/, "the payment/OAuth-triggered auto-activation path must check the real remaining-work signal");
  assert.match(autoActivateBody, /await chainPackageProducerIfMoreWorkRemains\(0\)/, "must genuinely AWAIT the chain call (this function itself runs inside the caller's own after()) so dispatch isn't raced away, not leave the rest of the near-term horizon stalled until a cron happens to fire");
  assert.match(activateRoute, /prepareResult\.moreWorkRemaining/, "the manual activate/resume route must check the same real signal");
  assert.match(activateRoute, /await chainPackageProducerIfMoreWorkRemains\(0\)/, "must chain the SAME real helper (no second implementation), genuinely awaited");
  console.log("Both real activation entry points chain the same self-continuing producer, genuinely awaited — PASS");

  // --- Admin backfill: also shares one real budget across its own loop,
  //     and chains too, so a real click never needs repeating ------------
  assert.match(adminActions, /const sharedDeadline = Date\.now\(\) \+ 130_000/, "the admin backfill loop must also share one real budget across every authorization it touches");
  assert.match(adminActions, /prepareNearTermPackageItems\([^)]*auth\.id, \{ deadlineMs: sharedDeadline \}\)/, "must pass the shared deadline down, matching the automatic path's own discipline");
  assert.match(adminActions, /if \(moreWorkRemaining\) \{[\s\S]{0,200}await chainPackageProducerIfMoreWorkRemains\(0\)/, "a real admin click must also hand off to the self-chaining producer instead of requiring a second click, genuinely awaited inside its own after()");
  console.log("runTenantContentBackfillAction: shares one real budget, chains on real remaining work, genuinely awaited — PASS");

  console.log("resumable-orchestration.test.ts: ALL PASS");
}

run();
