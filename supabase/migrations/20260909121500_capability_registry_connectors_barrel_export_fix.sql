-- Registers a real, customer-blocking production build defect found and
-- fixed during Final Production Certification: packages/connectors' own
-- barrel export (founder-computer/index.ts) never re-exported
-- capability-probe.ts or google-workflows.ts, so
-- apps/hermes-gateway/src/tool-handlers.ts's import of
-- probeGoogleCapabilities from "@stratxcel/connectors" failed to resolve
-- at type-check time -- and that file is genuinely in the Next.js build
-- graph, so `NODE_ENV=production npm run build` failed outright ("Failed
-- to type check"). Applied live via Supabase MCP; this file makes it
-- reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:connectors_barrel_export_integrity',
  'packages/connectors barrel export re-exports every founder-computer submodule -- fixes a real production build break',
  'Discovered during Final Production Certification (Section 6/19: run a real NODE_ENV=production build). A prior session''s live Google-capability-discovery work (packages/connectors/src/founder-computer/capability-probe.ts, google-workflows.ts) was never added to packages/connectors/src/founder-computer/index.ts''s export * list, even though apps/hermes-gateway/src/tool-handlers.ts already imports probeGoogleCapabilities from the public "@stratxcel/connectors" package entrypoint. tsc --noEmit reported TS2305 (no exported member) plus a downstream TS7006 implicit-any (results was untyped as a consequence), and a real NODE_ENV=production npm run build failed outright at the "Running TypeScript" step -- a genuine customer-blocking defect (the whole platform fails to build, not just this one feature), not a pre-existing/unrelated issue tolerated by this certification pass. Fixed narrowly: added `export * from "./capability-probe.ts"` and `export * from "./google-workflows.ts"` to founder-computer/index.ts -- zero other files touched, zero new logic. Also separately found & fixed: @novnc/novnc was declared in package.json/package-lock.json (added by the same upstream work, for the live browser viewer at app/admin/(shell)/personal-connectors/founder-computer/browser/page.tsx) but never installed in this local checkout, which had been producing a Turbopack "Module not found" warning (not a build failure, since it is a client-side dynamic import) -- resolved by installing from the already-committed lock file (no package.json/lock change; already correct).',
  'build_integrity',
  'Engineering',
  'N/A (build-time module resolution fix, not a runtime tool)',
  'read',
  'platform_only',
  'free',
  'low_mutation',
  'Before the fix: tsc --noEmit reported 2 real errors and NODE_ENV=production npm run build failed with "Failed to type check" (confirmed exit 0 check). After: tsc --noEmit clean (0 output), NODE_ENV=production npm run build exits 0 (explicitly verified via $? after redirecting to a log file), full route manifest printed normally. Re-ran every real, executable test that exercises this exact import path: packages/connectors/src/__tests__/founder-computer.test.ts (11/11 pass), packages/connectors/src/__tests__/resource-selector.test.ts (10/10 pass), packages/connectors/src/__tests__/live-hermes-execution.test.ts (8 passed / 0 failed / 9 correctly skipped -- live browser sections require FOUNDER_BROWSER_LIVE_TEST=1 + real EC2/browser access, an already-documented EXTERNAL_REQUIRED condition, not a defect). Lint clean on the changed file.',
  'REAL_EXPOSED',
  'This fix restores build integrity only -- it does not itself verify or extend the underlying live Google-capability-discovery / founder-browser feature''s own correctness, which remains that upstream session''s work and is out of scope for this certification pass beyond confirming it no longer breaks the shared production build.',
  now(),
  'claude_session_2026-09-09'
);
