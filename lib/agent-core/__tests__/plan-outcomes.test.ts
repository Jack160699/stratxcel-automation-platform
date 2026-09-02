// Run with: node --experimental-strip-types lib/agent-core/__tests__/plan-outcomes.test.ts
import assert from "node:assert/strict";
import { computePlanOutcomeObservations } from "../plan-outcomes.ts";

type Row = { id: string; source: string; values: unknown; captured_at: string; tenant_id: string; availability_state: string };

function fakeSupabase(rows: Row[]) {
  return {
    from(table: string) {
      if (table !== "search_measurement_snapshots") throw new Error(`unexpected table: ${table}`);
      return {
        select(_columns: string) {
          let filtered = rows;
          return {
            eq(column: string, value: string) {
              filtered = filtered.filter((r) => (r as never as Record<string, string>)[column] === value);
              return {
                eq(column2: string, value2: string) {
                  filtered = filtered.filter((r) => (r as never as Record<string, string>)[column2] === value2);
                  return {
                    order(_column: string, opts: { ascending: boolean }) {
                      const sorted = [...filtered].sort((a, b) => (opts.ascending ? a.captured_at.localeCompare(b.captured_at) : b.captured_at.localeCompare(a.captured_at)));
                      return Promise.resolve({ data: sorted, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function run() {
  // No snapshots at all since the plan was committed -> empty, not an error.
  {
    const supabase = fakeSupabase([]);
    const obs = await computePlanOutcomeObservations(supabase, "tenant-a", "2026-09-01T00:00:00Z");
    assert.deepEqual(obs, []);
  }

  // A real "before" and "after" GA4 snapshot -> a real, computed observation
  // with a real baseline and a real percent change, never invented.
  {
    const rows: Row[] = [
      { id: "snap-before", source: "ga4", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-08-25T00:00:00Z", values: { landingPages: [{ url: "/a", organicVisits: 100, conversions: 5 }] } },
      { id: "snap-after", source: "ga4", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-09-05T00:00:00Z", values: { landingPages: [{ url: "/a", organicVisits: 150, conversions: 8 }] } },
    ];
    const supabase = fakeSupabase(rows);
    const obs = await computePlanOutcomeObservations(supabase, "tenant-a", "2026-09-01T00:00:00Z");
    const sessions = obs.find((o) => o.metric === "website_sessions")!;
    assert.equal(sessions.current.value, 150);
    assert.equal(sessions.current.snapshotId, "snap-after");
    assert.deepEqual(sessions.baseline, { missing: false, value: 100, snapshotId: "snap-before", capturedAt: "2026-08-25T00:00:00Z", changePercent: 50 });
  }

  // A real "after" snapshot with NO prior snapshot at all -> baseline
  // explicitly missing, never fabricated as 0 or omitted silently.
  {
    const rows: Row[] = [
      { id: "snap-only", source: "search_console", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-09-05T00:00:00Z", values: { rows: [{ query: "q", clicks: 10, impressions: 200, ctr: 0.05, position: 4 }] } },
    ];
    const supabase = fakeSupabase(rows);
    const obs = await computePlanOutcomeObservations(supabase, "tenant-a", "2026-09-01T00:00:00Z");
    const clicks = obs.find((o) => o.metric === "search_clicks")!;
    assert.equal(clicks.current.value, 10);
    assert.deepEqual(clicks.baseline, { missing: true });
  }

  // Only a "before" snapshot (nothing captured since the plan) -> no
  // observation at all for that source, not a zero-value fabrication.
  {
    const rows: Row[] = [
      { id: "snap-old", source: "ga4", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-08-01T00:00:00Z", values: { landingPages: [{ url: "/a", organicVisits: 50 }] } },
    ];
    const supabase = fakeSupabase(rows);
    const obs = await computePlanOutcomeObservations(supabase, "tenant-a", "2026-09-01T00:00:00Z");
    assert.deepEqual(obs, []);
  }

  // Division-by-zero baseline (0 -> N) never produces a fabricated
  // "infinite%" change -- changePercent is explicitly null instead.
  {
    const rows: Row[] = [
      { id: "snap-before", source: "ga4", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-08-25T00:00:00Z", values: { landingPages: [{ url: "/a", organicVisits: 0 }] } },
      { id: "snap-after", source: "ga4", tenant_id: "tenant-a", availability_state: "connected", captured_at: "2026-09-05T00:00:00Z", values: { landingPages: [{ url: "/a", organicVisits: 20 }] } },
    ];
    const supabase = fakeSupabase(rows);
    const obs = await computePlanOutcomeObservations(supabase, "tenant-a", "2026-09-01T00:00:00Z");
    const sessions = obs.find((o) => o.metric === "website_sessions")!;
    assert.equal(sessions.baseline.missing, false);
    assert.equal((sessions.baseline as { changePercent: number | null }).changePercent, null);
  }

  console.log("plan-outcomes.test.ts (lib/agent-core): ALL PASS");
}

run();
