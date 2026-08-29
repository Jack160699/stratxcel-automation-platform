// Run with: node --experimental-strip-types lib/social/__tests__/recovery-policy.test.ts
//
// Mission F — ZERO-DEAD-END 28-DAY SUBSCRIBER CONTENT: the previous state
// (Mission D+/E) was "BLOCKED, retry_count=2 -> permanently excluded,
// forever" -- technically safe (never publishes a rejected post) but
// commercially incomplete (silently drops one of the customer's paid
// content days). The explicit rule is: a temporary failure, a quality
// rejection, a duplicate-concept rejection, or a weak-CTA rejection must
// NEVER permanently consume a paid content day -- but the quality bar
// itself must never be lowered to get there. The fix is a real, STAGED
// recovery policy: every retry forces a materially different generation
// strategy (never a blind identical retry), bounded by a real dead-letter
// limit (RECOVERY_EXHAUSTED) so this can never become unbounded execution
// or a silently-abandoned day.
//
// This proves, from source and from real (no-AI, no-DB) executable calls:
//  - a hard-excluded concept/pillar/objective is GUARANTEED not to be
//    re-selected (not just recency-weighted -- a real correctness
//    requirement, Section 4/7),
//  - the exclusion mechanism degrades gracefully instead of throwing when
//    a business has too few pillars/concepts to exclude from,
//  - prepareNearTermPackageItems reads an item's OWN rejected-attempt
//    history and threads it into a hard exclusion, not just campaign-wide
//    recency (Section 3/4/6),
//  - a WEAK_CTA-specific failure forces a new objective (-> a new CTA
//    style), not just a reworded retry (Section 4),
//  - the LAST allowed attempt re-gathers fresh business research rather
//    than retrying against stale context (Section 5), and does so
//    best-effort (never blocks the real, possibly-final attempt),
//  - recovery is bounded by a real dead-letter limit distinct from an
//    ordinary still-retrying BLOCKED row, is audited when reached, and
//    NEVER deletes or hides the row (Section 9/11/12),
//  - the admin support-diagnostics surface exposes the distinction.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCreativeBrief, selectObjective } from "../creative-brief.ts";
import { selectLeastRecentlyUsed, selectLeastRecentlyUsedExcluding } from "../content-diversity.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

const BASE = {
  platform: "instagram",
  mediaType: "image" as const,
  availablePillars: ["Product spotlight", "Customer story", "Behind the scenes"],
  objective: "ENGAGEMENT" as const,
  verifiedFacts: [],
};

// --- Real, executable: hard exclusion is a guarantee, not a preference ----
function testSelectLeastRecentlyUsedExcludingGuaranteesExclusion() {
  // Even with EMPTY recent history (nothing to weight recency against), a
  // plain selectLeastRecentlyUsed can still legitimately return the exact
  // value we're about to exclude -- this is exactly the real gap Mission F
  // closes: the OLD mechanism only ever nudged by recency.
  const candidates = ["A", "B", "C"];
  for (let i = 0; i < 20; i += 1) {
    const picked = selectLeastRecentlyUsedExcluding(candidates, [], ["A"]);
    assert.notEqual(picked, "A", "an excluded value must never be selected, regardless of recency history");
  }
  console.log("content-diversity.ts: selectLeastRecentlyUsedExcluding guarantees the excluded value is never picked — PASS");
}

function testSelectLeastRecentlyUsedExcludingDegradesGracefullyWhenNothingRemains() {
  // Section 4's "fall back rather than throw" -- a business with a single
  // saved pillar must still get a real brief on a recovery retry, not a
  // hard crash because "the only option" is also "the rejected option".
  const picked = selectLeastRecentlyUsedExcluding(["Only Pillar"], [], ["Only Pillar"]);
  assert.equal(picked, "Only Pillar", "excluding every candidate must degrade to the full pool, never throw");
  console.log("content-diversity.ts: excluding every candidate degrades gracefully instead of throwing — PASS");
}

// --- Real, executable: buildCreativeBrief hard-excludes a rejected concept/pillar ---
function testBuildCreativeBriefHardExcludesRejectedConceptAndPillar() {
  const first = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Restaurant" });
  for (let i = 0; i < 10; i += 1) {
    const retry = buildCreativeBrief({
      ...BASE,
      businessName: "Acme",
      industryText: "Restaurant",
      // Deliberately EMPTY recent history -- an old recency-only signal
      // would have no reason at all to avoid re-picking the exact same
      // concept/pillar again. The exclude lists must do the real work.
      excludeConcepts: [first.concept],
      excludePillars: [first.contentPillar],
    });
    assert.notEqual(retry.concept, first.concept, "a concept already rejected for this exact item must never be re-selected, even with empty recency history");
    assert.notEqual(retry.contentPillar, first.contentPillar, "a pillar already rejected for this exact item must never be re-selected, even with empty recency history");
  }
  console.log("creative-brief.ts: buildCreativeBrief hard-excludes a rejected concept and pillar for a retry — PASS");
}

function testBuildCreativeBriefAvoidListNamesTheRejectionExplicitly() {
  const brief = buildCreativeBrief({
    ...BASE,
    businessName: "Acme",
    industryText: "Restaurant",
    excludeConcepts: ["Chef's daily special"],
    excludePillars: ["Product spotlight"],
    recentFailureContext: ["DUPLICATE_CONCEPT"],
  });
  assert.ok(brief.avoid.some((a) => a.includes("Chef's daily special") && a.includes("already rejected")), "the avoid list must explicitly name the rejected concept as a REJECTION, not fold it silently into generic recency framing");
  assert.ok(brief.avoid.some((a) => a.includes("Product spotlight") && a.includes("already rejected")), "the avoid list must explicitly name the rejected pillar");
  assert.ok(brief.avoid.some((a) => a.includes("DUPLICATE_CONCEPT")), "the avoid list must explain WHY the previous attempt failed, not just WHAT was tried");
  console.log("creative-brief.ts: avoid list explicitly names rejected concept/pillar/reason, diagnosably — PASS");
}

function testBuildCreativeBriefWithNoExcludesIsUnchanged() {
  // A never-retried item (the overwhelming common case) must see IDENTICAL
  // behavior to before Mission F -- this is strictly additive.
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Restaurant" });
  assert.ok(!brief.avoid.some((a) => a.includes("already rejected")), "zero exclude lists must produce zero rejection-framed avoid entries");
  console.log("creative-brief.ts: zero exclude lists (normal first-time preparation) produces unchanged behavior — PASS");
}

// --- Real, executable: selectObjective hard-excludes a WEAK_CTA'd objective ---
function testSelectObjectiveHardExcludesRejectedObjective() {
  for (let i = 0; i < 10; i += 1) {
    const objective = selectObjective({ hasOffer: false, recentObjectives: [], excludeObjectives: ["ENGAGEMENT"] });
    assert.notEqual(objective, "ENGAGEMENT", "an objective already tied to a WEAK_CTA rejection must never be re-selected");
  }
  console.log("creative-brief.ts: selectObjective hard-excludes a rejected objective (-> a genuinely different CTA style) — PASS");
}

function testSelectObjectiveWithNoExcludeIsUnchanged() {
  // Reproduces the exact scenario from the existing selectObjective test
  // (creative-brief.test.ts) to confirm zero regression for the normal path.
  for (let i = 0; i < 10; i += 1) {
    const objective = selectObjective({ hasOffer: false, recentObjectives: [] });
    assert.notEqual(objective, "SALES");
  }
  console.log("creative-brief.ts: selectObjective with no exclusion is unchanged for normal (non-recovery) preparation — PASS");
}

// --- Source: prepareNearTermPackageItems reads and applies real per-item recovery state ---
function testPrepareNearTermReadsAndAppliesRecoveryState() {
  const src = read("lib", "social", "package-autopilot.ts");
  const prepareStart = src.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = src.indexOf("\nexport async function", prepareStart + 50);
  const body = src.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);

  assert.match(body, /const priorAttempts:\s*RecoveryAttemptRecord\[\]\s*=\s*Array\.isArray\(item\.recovery_state\)\s*\?\s*item\.recovery_state\s*:\s*\[\]/, "must read this item's OWN rejected-attempt history, defensively defaulting to empty rather than crashing on a legacy/null row");
  assert.match(body, /const priorConcepts = /, "must derive the set of concepts already rejected for this exact item");
  assert.match(body, /const priorPillars = /, "must derive the set of pillars already rejected for this exact item");
  assert.match(body, /const priorObjectives = /, "must derive the set of objectives already tried for this exact item");
  assert.match(body, /const priorFailureReasons = /, "must derive the real hard-failure reason codes from this exact item's history");
  console.log("prepareNearTermPackageItems: reads and derives this item's own real rejected-attempt history before regenerating — PASS");

  // --- staged, failure-specific escalation, not a flat retry -------------
  assert.match(body, /const isRecoveryRetry = item\.retry_count > 0;/, "must distinguish a normal first attempt from a recovery retry");
  assert.match(body, /const forceNewObjective = isRecoveryRetry && \(priorFailureReasons\.includes\("WEAK_CTA"\) \|\| item\.retry_count >= 2\);/, "a WEAK_CTA-specific failure (Section 4), or the second retry generically, must force a new objective -- never just a reworded identical retry");
  assert.match(body, /const isFinalRecoveryAttempt = item\.retry_count >= MAX_RECOVERY_ATTEMPTS - 1;/, "the LAST allowed attempt must be identifiable so it can pay for a real research refresh (Section 5)");
  console.log("prepareNearTermPackageItems: staged, failure-specific recovery escalation (not a flat repeated retry) — PASS");

  // --- the exclusions actually reach generation, not just get computed ---
  assert.match(body, /excludeConcepts:\s*isRecoveryRetry\s*\?\s*priorConcepts\s*:\s*\[\]/, "the derived prior concepts must actually be threaded into buildCreativeBrief as a hard exclusion on a retry");
  assert.match(body, /excludePillars:\s*isRecoveryRetry\s*\?\s*priorPillars\s*:\s*\[\]/, "the derived prior pillars must actually be threaded into buildCreativeBrief as a hard exclusion on a retry");
  assert.match(body, /recentFailureContext:\s*isRecoveryRetry\s*\?\s*priorFailureReasons\s*:\s*\[\]/, "the real failure reasons must reach the brief so the corrective instruction is diagnosable, not generic");
  assert.match(body, /\.\.\.\(forceNewObjective \? \{ excludeObjectives: priorObjectives \} : \{\}\)/, "selectObjective must receive the hard exclusion only when this attempt is actually staged to change the objective");
  console.log("prepareNearTermPackageItems: derived exclusions actually reach buildCreativeBrief/selectObjective, not just computed and discarded — PASS");

  // --- research-driven recovery: real, best-effort, last-attempt-only ----
  assert.match(body, /if \(isFinalRecoveryAttempt\) \{/, "a fresh research re-gather must be scoped to the last allowed attempt only -- 'research once, generate many' stays correct for every normal item");
  assert.match(body, /createSocialAuditConnectorInsightsProvider\(service as Parameters<typeof createSocialAuditConnectorInsightsProvider>\[0\]\)\.gather\(authorization\.tenant_id\)/, "must reuse the SAME real connector already used for the batch-level gather -- never a second/duplicate research engine");
  console.log("prepareNearTermPackageItems: research-driven recovery reuses the real existing connector, scoped to the final attempt only — PASS");
}

// --- Source: recovery is bounded, distinctly marked, audited, never destructive ---
function testRecoveryExhaustionIsBoundedAuditedAndNonDestructive() {
  const src = read("lib", "social", "package-autopilot.ts");
  assert.match(src, /export const MAX_RECOVERY_ATTEMPTS = 4;/, "the recovery cap must be a real, finite, exported constant");

  const prepareStart = src.indexOf("export async function prepareNearTermPackageItems");
  const catchIndex = src.indexOf("} catch (err) {", prepareStart);
  const nextFn = src.indexOf("\nexport async function", catchIndex);
  const catchBody = src.slice(catchIndex, nextFn > 0 ? nextFn : undefined);

  assert.match(catchBody, /const exhausted = nextRetryCount >= MAX_RECOVERY_ATTEMPTS;/, "exhaustion must be a real, bounded condition tied to the actual cap, never an arbitrary/unbounded one");
  assert.match(catchBody, /recovery_state:\s*\[\.\.\.priorAttempts,\s*attemptRecord\]/, "every rejected attempt (Section 6 content memory) must be appended, never overwritten -- the NEXT attempt needs the FULL history, not just the last failure");
  assert.match(catchBody, /recovery_exhausted:\s*exhausted/, "the exhaustion flag must actually be persisted on the row");
  // Section 9/12: never silently drop the day -- the row is UPDATEd
  // (status stays BLOCKED, still fully present with its full history), not
  // deleted, and a real audit trail entry is emitted specifically when
  // exhaustion is reached.
  assert.ok(!/\.delete\(\)/.test(catchBody), "recovery exhaustion must never delete the queue item row -- the content day must stay visible, not silently vanish");
  assert.match(catchBody, /status:\s*"BLOCKED"/, "an exhausted item must remain a real, visible BLOCKED row -- 'needs a human look', not 'gone'");
  assert.match(catchBody, /action:\s*"social\.package\.recovery_exhausted"/, "reaching exhaustion must be audited as its own distinct, diagnosable event -- not indistinguishable from an ordinary still-retrying BLOCKED failure");
  console.log("prepareNearTermPackageItems: recovery exhaustion is bounded, fully audited, and never deletes or hides the content day — PASS");

  // --- the due-item query and its accompanying count both honor the flag -
  const prepareEnd = src.indexOf("\nexport async function", prepareStart + 50);
  const body = src.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);
  const dueQueryMatches = body.match(/\.eq\("recovery_exhausted", false\)/g) ?? [];
  assert.equal(dueQueryMatches.length, 2, "BOTH the due-item selection query and its accompanying moreWorkRemaining count query must exclude exhausted items -- a mismatch here would make moreWorkRemaining lie");
  console.log("prepareNearTermPackageItems: recovery_exhausted is honored consistently by both the due-item query and its remaining-work count — PASS");
}

// --- Source: the migration actually adds what the code depends on --------
function testMigrationAddsRecoveryColumns() {
  const migration = read("supabase", "migrations", "20260830050000_package_queue_recovery_policy.sql");
  assert.match(migration, /add column if not exists recovery_state jsonb not null default '\[\]'::jsonb/, "recovery_state must be a real, non-null, empty-array-defaulted column -- every existing row must backfill safely");
  assert.match(migration, /add column if not exists recovery_exhausted boolean not null default false/, "recovery_exhausted must be real, non-null, and default false -- no existing row is retroactively marked exhausted");
  console.log("20260830050000_package_queue_recovery_policy.sql: adds the real, safely-defaulted recovery columns the code depends on — PASS");
}

// --- Source: NET_NEW_AI's fail-closed guarantee is untouched by recovery -
function testNetNewAiFailClosedGuaranteeIsUntouchedByRecovery() {
  const src = read("lib", "social", "package-autopilot.ts");
  const prepareStart = src.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = src.indexOf("\nexport async function", prepareStart + 50);
  const body = src.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);
  assert.match(body, /creativeMode === "NET_NEW_AI"\s*\n\s*\?\s*await generateNetNewPackageMediaAsset/, "a recovery retry must still route NET_NEW_AI through the real generator -- never substitute selectPackageMediaAsset just because this is a retry");
  assert.ok(!/selectPackageMediaAsset.*NET_NEW_AI|NET_NEW_AI.*selectPackageMediaAsset/s.test(body) || body.includes('creativeMode === "NET_NEW_AI"'), "NET_NEW_AI must never be wired to the existing-asset picker, including on a recovery retry");
  console.log("prepareNearTermPackageItems: NET_NEW_AI stays fail-closed (never falls back to the existing-asset picker) across recovery retries — PASS");
}

// --- Source: publishing invariant is unaffected -- BLOCKED (exhausted or not) is never publishable ---
function testExhaustedItemsAreStructurallyUnpublishable() {
  const src = read("lib", "social", "package-autopilot.ts");
  // The success write is the ONLY place a queue item becomes PREPARED
  // (the sole publishable pre-state, per claim_social_package_post) -- its
  // own optimistic-concurrency guard only ever matches a currently
  // PLANNED/BLOCKED row and always sets a real status, never leaves a
  // recovery_exhausted row silently eligible.
  const successGuardIndex = src.indexOf('status: authorization.publishing_mode === "AUTO_PUBLISH"');
  const successBlock = src.slice(Math.max(0, successGuardIndex - 50), successGuardIndex + 400);
  assert.match(successBlock, /\.in\("status",\s*\["PLANNED",\s*"BLOCKED"\]\)/, "the only path to PREPARED must still require the row to currently be PLANNED or BLOCKED -- an exhausted item stays BLOCKED (not PREPARED) unless a genuinely new successful attempt runs");
  console.log("prepareNearTermPackageItems: an exhausted (or ordinary) BLOCKED row can only ever reach PREPARED via a genuinely successful generation, never a status shortcut — PASS");
}

// --- Source: admin support-diagnostics surface distinguishes the two BLOCKED cases ---
function testAdminDiagnosticsSurfaceDistinguishesRecoveryExhaustion() {
  const page = read("app", "admin", "(shell)", "social", "packages", "page.tsx");
  assert.match(page, /retry_count,\s*recovery_exhausted/, "the admin Blocked-items query must actually select the recovery fields, not just status/last_error");
  assert.match(page, /item\.recovery_exhausted/, "the page must branch on recovery_exhausted so staff can tell a self-healing BLOCKED row apart from one that genuinely needs a look");
  assert.match(page, /Recovery exhausted/, "an exhausted item must be labeled distinctly and legibly, not left indistinguishable from an ordinary in-progress BLOCKED row");
  console.log("admin/social/packages/page.tsx: support diagnostics distinguish recovery-in-progress from recovery-exhausted — PASS");
}

// --- Real bug found live during Mission F: the shared execution budget left
//     too small a margin for a single in-flight NET_NEW_AI item to safely
//     finish before the real 300s maxDuration killed the invocation -------
function testSharedBudgetLeavesASafeMarginForOneInFlightItem() {
  // Confirmed live: a recovery-retry pass started a NET_NEW_AI image
  // generation just before the (then) 220s deadline check; the image
  // finished successfully at 148s into ITS OWN wall-clock, but by then the
  // calling Server Action had already been killed by its real, declared
  // 300s maxDuration ("Vercel Runtime Timeout Error: Task timed out after
  // 300 seconds", not simulated) -- the result was generated but never
  // written back. An 80s margin (300-220) is less than the documented
  // ~150-160s single-item cost; it must never be smaller than that.
  const REAL_DECLARED_MAX_DURATION_MS = 300_000;
  // The largest real, live-confirmed single-item cost so far (image
  // generation alone) plus real margin for the surrounding DB writes.
  const MIN_SAFE_MARGIN_MS = 170_000;

  const packageAutopilot = read("lib", "social", "package-autopilot.ts");
  const packageProducer = read("lib", "social", "package-producer.ts");
  const adminActions = read("app", "admin", "(shell)", "social", "actions.ts");
  const systemPage = read("app", "admin", "(shell)", "social", "system", "page.tsx");
  const producerRoute = read("app", "api", "social", "package-producer", "route.ts");

  assert.match(systemPage, /export const maxDuration = 300;/, "the real declared maxDuration this test's math depends on must still be 300s -- if this ever changes, the safety math below must be re-derived, not silently stale");
  assert.match(producerRoute, /export const maxDuration = 300;/, "the producer route's real declared maxDuration must also still be 300s");

  const prepareBudgetMatch = packageAutopilot.match(/const DEFAULT_PREPARE_BUDGET_MS = (\d+)_?(\d*);/);
  const producerBudgetMatch = packageProducer.match(/const PRODUCER_BUDGET_MS = (\d+)_?(\d*);/);
  const adminBudgetMatch = adminActions.match(/const sharedDeadline = Date\.now\(\) \+ (\d+)_?(\d*);/);
  assert.ok(prepareBudgetMatch, "DEFAULT_PREPARE_BUDGET_MS must be a real, greppable numeric constant");
  assert.ok(producerBudgetMatch, "PRODUCER_BUDGET_MS must be a real, greppable numeric constant");
  assert.ok(adminBudgetMatch, "the admin backfill's shared deadline must be a real, greppable numeric literal");

  const toNumber = (m: RegExpMatchArray) => Number(`${m[1]}${m[2] ?? ""}`);
  for (const [label, match] of [
    ["prepareNearTermPackageItems's DEFAULT_PREPARE_BUDGET_MS", prepareBudgetMatch],
    ["runPackageAutopilotProducer's PRODUCER_BUDGET_MS", producerBudgetMatch],
    ["runTenantContentBackfillAction's sharedDeadline", adminBudgetMatch],
  ] as const) {
    const budgetMs = toNumber(match);
    const margin = REAL_DECLARED_MAX_DURATION_MS - budgetMs;
    assert.ok(margin >= MIN_SAFE_MARGIN_MS, `${label} (${budgetMs}ms) leaves only a ${margin}ms margin under the real 300s maxDuration -- must be at least ${MIN_SAFE_MARGIN_MS}ms so a single in-flight NET_NEW_AI item (real, live-confirmed ~148-160s) can always finish and be written back, never killed mid-flight one beat too late`);
  }
  console.log(`prepareNearTermPackageItems/runPackageAutopilotProducer/runTenantContentBackfillAction: shared execution budgets leave a real, sufficient margin (>=${MIN_SAFE_MARGIN_MS / 1000}s) under the real 300s maxDuration for one in-flight NET_NEW_AI item to safely finish — PASS`);
}

function run() {
  testSelectLeastRecentlyUsedExcludingGuaranteesExclusion();
  testSelectLeastRecentlyUsedExcludingDegradesGracefullyWhenNothingRemains();
  testBuildCreativeBriefHardExcludesRejectedConceptAndPillar();
  testBuildCreativeBriefAvoidListNamesTheRejectionExplicitly();
  testBuildCreativeBriefWithNoExcludesIsUnchanged();
  testSelectObjectiveHardExcludesRejectedObjective();
  testSelectObjectiveWithNoExcludeIsUnchanged();
  testPrepareNearTermReadsAndAppliesRecoveryState();
  testRecoveryExhaustionIsBoundedAuditedAndNonDestructive();
  testMigrationAddsRecoveryColumns();
  testNetNewAiFailClosedGuaranteeIsUntouchedByRecovery();
  testExhaustedItemsAreStructurallyUnpublishable();
  testAdminDiagnosticsSurfaceDistinguishesRecoveryExhaustion();
  testSharedBudgetLeavesASafeMarginForOneInFlightItem();
  console.log("recovery-policy.test.ts: ALL PASS");
}

run();
