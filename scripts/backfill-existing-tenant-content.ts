// Retroactive Tenant Backfill mission: existing tenants whose Social
// Autopilot was activated (or last resumed) BEFORE the "instant day-one
// content" hardening (app/api/platform/social/autopilot/route.ts's
// triggerImmediatePackagePreparation, called only from the activate/resume
// actions) never received that on-activation plan+prepare call -- their
// content pipeline only ever filled via whatever the hourly
// package-producer cron happened to already do, which can leave a real gap
// for a tenant that activated shortly before a mission/deploy boundary.
//
// This walks every real ACTIVE/NEEDS_ATTENTION authorization and (under
// --execute) calls the exact same two functions the live activate/resume
// endpoints call -- planPackagePeriod (fills PLANNED slots up to the
// period's entitled unit count) then prepareNearTermPackageItems (turns
// near-term PLANNED slots into real generated content). Both are
// explicitly documented in package-autopilot.ts as idempotent/safe to
// call repeatedly -- a tenant whose queue is already full simply gets
// planned=0/prepared=0 back, and a re-run (or overlap with the regular
// cron tick) can never double-plan or double-prepare anything. No bespoke
// "is this tenant missing content" heuristic is used for that reason -- it
// would just be a second, possibly wrong, definition of the same thing
// these functions already determine correctly on their own.
//
// SAFETY:
//  - Defaults to a DRY RUN: lists every eligible authorization and its
//    CURRENT unresolved queue-item count, using only direct table reads --
//    writes nothing, calls no AI provider, imports no mutating code at all.
//    Pass --execute to actually run planPackagePeriod +
//    prepareNearTermPackageItems for each one.
//  - Respects the SAME kill switch runPackageAutopilotBatch honors
//    (global_hermes + package-autopilot-worker scopes, via
//    packageKillSwitchActive) -- fails closed (refuses to run) if the
//    switch is enabled OR unreadable, under --execute.
//  - One tenant's failure never aborts the run for the rest -- caught,
//    logged, counted, continues to the next authorization.
//  - Sequential, not concurrent: prepareNearTermPackageItems makes real
//    Gemini calls per item. Running many tenants in parallel would just be
//    a self-inflicted burst against the same provider quota this codebase
//    has already hit real limits on (see scripts/quality-campaign-generate.ts).
//
// KNOWN LIMITATION, HONESTLY DOCUMENTED RATHER THAN WORKED AROUND: this
// codebase's own test suite already notes (see content-engine-hardening.
// test.ts's header) that package-autopilot.ts is "too deeply Supabase/
// Next-coupled to live-import" in a plain node harness. Confirmed live
// while building this script: package-autopilot.ts imports
// ./agent/publish-outcome.ts -> ./worker.ts -> ./providers (real Meta/
// LinkedIn/YouTube API clients), a real, pre-existing, repo-wide chain of
// relative imports missing their required .ts extension for Node's
// --experimental-strip-types ESM resolver (harmless under Next.js's own
// bundler, which resolves either way -- that's why nothing caught it
// before). Fixing that entire chain is a large, separate, out-of-scope
// cleanup unrelated to this mission; two shallow, genuinely-broken
// extensionless imports directly in this script's own dependency path
// (lib/social/repositories/publishing.ts) were fixed as real bug fixes,
// but the deeper worker.ts/providers fan-out was deliberately left alone
// rather than dragging 15-20 unrelated files into this diff to chase a
// plain-node-runnability nice-to-have.
//
// Because a static top-level `import` loads a module's ENTIRE dependency
// graph regardless of which named export is actually used, package-
// autopilot.ts is imported here dynamically (await import(...)), and only
// inside the --execute branch -- so DRY RUN (the default, and the only
// mode actually exercised by lib/social/repositories/publishing.ts's own
// fix above) needs no dynamic import at all and is fully verified working
// standalone. --execute will hit the same ERR_MODULE_NOT_FOUND this
// header describes and fails with a clear, honest message pointing at the
// real verified execution path below, instead of writing nothing while
// silently pretending to have worked.
//
// The VERIFIED, REAL execution path for actually writing/preparing content
// is the admin server action runTenantContentBackfillAction
// (app/admin/(shell)/social/actions.ts), wired to a real "Backfill
// existing tenant content" button on /admin/social/system -- it calls the
// exact same planPackagePeriod + prepareNearTermPackageItems functions, in
// -process, inside Next.js's own module resolution (which has none of
// this script's import-graph problem).
//
// Usage (from repo root):
//   node --env-file=.env.local --experimental-strip-types scripts/backfill-existing-tenant-content.ts            (dry run — safe, read-only, verified working)
//   node --env-file=.env.local --experimental-strip-types scripts/backfill-existing-tenant-content.ts --execute  (real run — will fail with a clear message; use the admin action instead, see above)

import { createSupabaseServiceClient } from "../lib/supabase/service.ts";
// Type-only import: erased entirely at runtime (never triggers the real
// module load / the import-graph problem this file's header describes) --
// used only so the dynamic `await import(...)` below and the Parameters<>
// casts stay properly typed instead of resolving to `any`.
import type * as PackageAutopilotTypes from "../lib/social/package-autopilot.ts";
type PlanPackagePeriodFn = typeof PackageAutopilotTypes.planPackagePeriod;
type PrepareNearTermPackageItemsFn = typeof PackageAutopilotTypes.prepareNearTermPackageItems;
type PackageKillSwitchActiveFn = typeof PackageAutopilotTypes.packageKillSwitchActive;

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const service = createSupabaseServiceClient();

  let planPackagePeriod: PlanPackagePeriodFn | undefined;
  let prepareNearTermPackageItems: PrepareNearTermPackageItemsFn | undefined;
  let packageKillSwitchActive: PackageKillSwitchActiveFn | undefined;

  if (EXECUTE) {
    try {
      ({ planPackagePeriod, prepareNearTermPackageItems, packageKillSwitchActive } = await import("../lib/social/package-autopilot.ts"));
    } catch (err) {
      console.error(
        "[Backfill] --execute cannot run standalone right now: package-autopilot.ts's import graph has a pre-existing, unrelated module-resolution gap outside Next.js (see this file's own header comment for details).\n" +
        "Use the verified execution path instead: the \"Backfill existing tenant content\" button on /admin/social/system (runTenantContentBackfillAction in app/admin/(shell)/social/actions.ts).\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
    const kill = await packageKillSwitchActive!(service as Parameters<PackageKillSwitchActiveFn>[0]);
    if (kill.active) {
      console.error(`[Backfill] Refusing to run: package autopilot kill switch is active (scope=${kill.scope ?? "unknown"}, reason=${kill.reason ?? "none given"}). Resolve/lift the kill switch first.`);
      process.exit(1);
    }
  }

  const { data: authorizations, error } = await service
    .from("social_autopilot_authorizations")
    .select("id, tenant_id, state, period_number, publishing_mode")
    .in("state", ["ACTIVE", "NEEDS_ATTENTION"]);
  if (error) {
    console.error("[Backfill] Failed to query social_autopilot_authorizations:", error.message);
    process.exit(1);
  }
  if (!authorizations || authorizations.length === 0) {
    console.log("[Backfill] No ACTIVE/NEEDS_ATTENTION Social Autopilot authorizations found. Nothing to do.");
    return;
  }

  console.log(`=== STRATXCEL RETROACTIVE TENANT CONTENT BACKFILL — ${EXECUTE ? "EXECUTE" : "DRY RUN"} ===`);
  console.log(`Found ${authorizations.length} eligible authorization(s).\n`);

  let totalPlanned = 0;
  let totalPrepared = 0;
  let totalBlocked = 0;
  let failures = 0;

  for (const auth of authorizations) {
    const { data: tenant } = await service.from("tenants").select("name").eq("id", auth.tenant_id).maybeSingle();
    const { count: unresolvedBefore } = await service
      .from("social_autopilot_queue_items")
      .select("id", { count: "exact", head: true })
      .eq("authorization_id", auth.id)
      .eq("period_number", auth.period_number)
      .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED"]);

    const label = `${tenant?.name ?? "Unknown tenant"} (${auth.tenant_id}) · authorization ${auth.id}`;

    if (!EXECUTE) {
      console.log(`- ${label}: state=${auth.state}, publishingMode=${auth.publishing_mode}, unresolved queue items=${unresolvedBefore ?? 0}`);
      continue;
    }

    try {
      const planResult = await planPackagePeriod!(service as Parameters<PlanPackagePeriodFn>[0], auth.id);
      const prepareResult = await prepareNearTermPackageItems!(service as Parameters<PrepareNearTermPackageItemsFn>[0], auth.id);
      totalPlanned += planResult.planned;
      totalPrepared += prepareResult.prepared;
      totalBlocked += prepareResult.blocked;
      console.log(
        `- ${label}: unresolved-before=${unresolvedBefore ?? 0} planned=${planResult.planned}` +
        `${planResult.blockedReason ? ` (blocked: ${planResult.blockedReason})` : ""} prepared=${prepareResult.prepared} blocked=${prepareResult.blocked}`
      );
    } catch (err) {
      failures++;
      console.error(`- ${label}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n=============================================");
  if (!EXECUTE) {
    console.log(`Dry run complete. Nothing was written and no AI provider was called. Re-run with --execute to actually plan + prepare content for the ${authorizations.length} authorization(s) above (see this file's header if --execute fails to import).`);
  } else {
    console.log(`Execute complete. Totals across ${authorizations.length} authorization(s): planned=${totalPlanned}, prepared=${totalPrepared}, blocked=${totalBlocked}, failures=${failures}.`);
  }
}

main().catch((err) => {
  console.error("[Backfill] Unhandled error:", err);
  process.exit(1);
});
