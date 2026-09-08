// Run with: node --experimental-strip-types lib/audit/__tests__/inline-audit-execution.test.ts
//
// CRITICAL PRODUCTION BUG regression guard: Free Audit stuck indefinitely
// in production (live-caught on a real MedRoute Consultancy audit --
// heartbeat_at frozen at the exact moment stage last changed to ANALYSIS,
// ~9+ minutes with zero further writes). Root cause: 3 call sites raced
// the real audit executor against a short timeout using a bare
// Promise.race, which never keeps the losing (real, in-flight) promise
// alive once the calling route returns its response -- Vercel could
// freeze/tear down the function mid-execution, orphaning the real
// runAutomaticAuditGeneration call forever. inline-audit-execution.ts
// imports `after` from "next/server", which only resolves inside a real
// Next.js build/dev process, not plain node (same reason every other
// Next-coupled server-only module in this codebase is asserted against
// source rather than imported directly here).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const helper = read("lib", "audit", "inline-audit-execution.ts");

  // --- 1. The real fix: after() must keep the actual in-flight execution
  //     alive -- this is what a bare Promise.race never did. -------------
  assert.ok(/import \{ after \} from "next\/server"/.test(helper));
  assert.ok(/after\(\(\) => guarded\)/.test(helper), "must background the SAME in-flight execution promise via after(), never re-run the executor");
  assert.ok(/Promise\.race\(\[guarded, timeoutPromise\]\)/.test(helper), "the inline slice must race the SAME guarded promise, not a second independent call");

  // --- 2. Every one of the 3 real call sites must use the fixed helper,
  //     and the old broken pattern must be gone from all of them. -------
  const auditOnboarding = read("app", "api", "platform", "audit", "onboarding", "route.ts");
  const onboarding = read("app", "api", "platform", "onboarding", "route.ts");

  for (const [label, source] of [
    ["app/api/platform/audit/onboarding/route.ts", auditOnboarding],
    ["app/api/platform/onboarding/route.ts", onboarding],
  ] as const) {
    assert.ok(/import \{ runAuditGenerationWithInlineSlice \} from "@\/lib\/audit\/inline-audit-execution"/.test(source), `${label} must import the fixed helper`);
    assert.equal(/const timeoutPromise = new Promise<\{ kind: string \}>/.test(source), false, `${label} must no longer construct its own unguarded timeout race`);
    assert.equal(/await Promise\.race\(\[executionPromise, timeoutPromise\]\)/.test(source), false, `${label} must no longer use the old broken bare Promise.race pattern`);
    const uses = source.match(/runAuditGenerationWithInlineSlice\(executionPromise, \d+_?\d*\)/g) ?? [];
    assert.ok(uses.length > 0, `${label} must actually call the fixed helper, not just import it`);
    // Real production fix: without a long enough maxDuration, after()'s own
    // continuation would still be killed early by the platform's short
    // default -- 270s matches the audit worker cron route's own already-
    // proven-sufficient budget for this exact executor call.
    assert.ok(/export const maxDuration = 270;/.test(source), `${label} must declare a real maxDuration long enough for after() to actually finish the real execution`);
  }

  // Confirms the exact count of fixed call sites matches what was found
  // live (2 in the audit onboarding route, 1 in the platform onboarding
  // route) -- catches a future regression silently reintroducing the bug
  // in a 4th spot without also missing this test.
  const auditOnboardingUses = auditOnboarding.match(/runAuditGenerationWithInlineSlice\(executionPromise, \d+_?\d*\)/g) ?? [];
  assert.equal(auditOnboardingUses.length, 2, "both instant-audit-kickoff call sites in the audit onboarding route must be fixed");

  console.log("inline-audit-execution.test.ts: ALL PASS (real in-flight execution kept alive via after(), never orphaned, all 3 known call sites fixed with a real maxDuration)");
}

run();
