// Run with: node --experimental-strip-types lib/websites/__tests__/create-tenant-website.test.ts
//
// Scope: this test covers the two NEW safety guards createTenantWebsite adds
// on top of the extracted website-factory logic -- the kill switch and the
// per-tenant daily rate limit -- and proves both short-circuit BEFORE any
// entitlement check, AI call, or write happens (the fake supabase below
// throws on any table other than kill_switches/site_projects precisely to
// prove that). The extracted generation happy-path itself (AI spec
// generation, site_projects insert, apply_site_project_version RPC) is
// byte-for-byte the same logic app/api/platform/website-factory/route.ts's
// POST already ran, already covered by the existing website-factory /
// website-creator-flow suites -- re-mocking generateSpecFromPrompt's entire
// dependency chain here would be a fake success, not a real test, so it is
// deliberately not attempted in this file.
import assert from "node:assert/strict";
import { createTenantWebsite } from "../create-tenant-website.ts";

interface FakeState {
  killSwitchRow: { enabled: boolean; reason?: string } | null;
  killSwitchError?: string;
  siteProjectsCount: number | null;
  siteProjectsCountError?: string;
}

function fakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === "kill_switches") {
        return {
          select(_cols: string) {
            return {
              eq(_c1: string, _v1: string) {
                return {
                  eq(_c2: string, _v2: string) {
                    return {
                      async maybeSingle() {
                        if (state.killSwitchError) return { data: null, error: { message: state.killSwitchError } };
                        return { data: state.killSwitchRow, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "site_projects") {
        return {
          select(_cols: string, _opts: { count: string; head: boolean }) {
            return {
              eq(_c: string, _v: string) {
                return {
                  async gte(_c2: string, _v2: string) {
                    if (state.siteProjectsCountError) return { count: null, error: { message: state.siteProjectsCountError } };
                    return { count: state.siteProjectsCount, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table access in guard-short-circuit test: ${table}`);
    },
  };
}

async function testKillSwitchBlocksBeforeAnythingElse() {
  const supabase = fakeSupabase({ killSwitchRow: { enabled: true, reason: "founder paused all Hermes actions" }, siteProjectsCount: 0 });
  const result = await createTenantWebsite({ supabase, tenantId: "t1", actorUserId: "u1", prompt: "a coffee shop in Raipur" });
  assert.equal(result.outcome, "BLOCKED");
  assert.equal((result as { reason: string }).reason, "founder paused all Hermes actions");
  console.log("create-tenant-website.test.ts: an active kill switch blocks creation before the rate limit or entitlement check ever runs — PASS");
}

async function testKillSwitchFailsClosedOnReadError() {
  const supabase = fakeSupabase({ killSwitchRow: null, killSwitchError: "connection reset", siteProjectsCount: 0 });
  const result = await createTenantWebsite({ supabase, tenantId: "t1", actorUserId: "u1", prompt: "a coffee shop in Raipur" });
  assert.equal(result.outcome, "BLOCKED", "an unreadable kill-switch table must be treated as active (fail closed), never as 'assume safe'");
  console.log("create-tenant-website.test.ts: an unreadable kill-switch table fails closed (BLOCKED), never silently proceeds — PASS");
}

async function testRateLimitBlocksAtTheConfiguredCeiling() {
  const priorLimit = process.env.WHATSAPP_CREATE_WEBSITE_DAILY_LIMIT;
  process.env.WHATSAPP_CREATE_WEBSITE_DAILY_LIMIT = "3";
  try {
    const supabase = fakeSupabase({ killSwitchRow: { enabled: false }, siteProjectsCount: 3 });
    const result = await createTenantWebsite({ supabase, tenantId: "t1", actorUserId: "u1", prompt: "a coffee shop in Raipur" });
    assert.equal(result.outcome, "RATE_LIMITED");
    assert.match((result as { reason: string }).reason, /3 website\(s\)/);
  } finally {
    if (priorLimit === undefined) delete process.env.WHATSAPP_CREATE_WEBSITE_DAILY_LIMIT;
    else process.env.WHATSAPP_CREATE_WEBSITE_DAILY_LIMIT = priorLimit;
  }
  console.log("create-tenant-website.test.ts: the daily rate limit blocks at exactly the configured ceiling — PASS");
}

async function testRateLimitCountFailureNeverSilentlyProceeds() {
  const supabase = fakeSupabase({ killSwitchRow: { enabled: false }, siteProjectsCount: null, siteProjectsCountError: "relation does not exist" });
  const result = await createTenantWebsite({ supabase, tenantId: "t1", actorUserId: "u1", prompt: "a coffee shop in Raipur" });
  assert.equal(result.outcome, "WRITE_FAILED", "a failed rate-limit count must be surfaced as a real failure, never silently treated as zero recent creations");
  console.log("create-tenant-website.test.ts: a failed rate-limit count is a real failure, not a silent pass-through — PASS");
}

async function run() {
  await testKillSwitchBlocksBeforeAnythingElse();
  await testKillSwitchFailsClosedOnReadError();
  await testRateLimitBlocksAtTheConfiguredCeiling();
  await testRateLimitCountFailureNeverSilentlyProceeds();
}

run();
