// Run with: node --experimental-strip-types lib/agent-core/__tests__/business-signals.test.ts
import assert from "node:assert/strict";
import { computeRealBusinessSignals } from "../business-signals.ts";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            async eq(column: string, value: string) {
              const rows = (tables[table] ?? []).filter((r) => r[column] === value);
              return { data: rows, error: null };
            },
          };
        },
      };
    },
  };
}

async function run() {
  // Empty tenant: nothing computed, no evidence fabricated.
  {
    const supabase = fakeSupabase({});
    const { signals, sourceCounts } = await computeRealBusinessSignals(supabase, "t1");
    assert.deepEqual(signals, {});
    assert.deepEqual(sourceCounts, { siteProjects: 0, searchOpportunities: 0, crmLeads: 0 });
  }

  // hasWebsite: a real site_projects row sets it true with real evidence.
  {
    const supabase = fakeSupabase({
      site_projects: [{ id: "sp1", tenant_id: "t1" }],
    });
    const { signals } = await computeRealBusinessSignals(supabase, "t1");
    assert.equal(signals.hasWebsite, true);
    assert.ok(signals.signalEvidenceIds?.includes("site_project:sp1"));
    // Never claims hasWebsite === false just from a missing row for a
    // DIFFERENT tenant.
    const other = await computeRealBusinessSignals(supabase, "t2");
    assert.equal(other.signals.hasWebsite, undefined);
  }

  // searchVisibilityStrength: 3+ open Critical/High opportunities -> "none".
  {
    const supabase = fakeSupabase({
      search_opportunities: [
        { id: "o1", tenant_id: "t1", severity: "Critical", status: "NEW" },
        { id: "o2", tenant_id: "t1", severity: "High", status: "ACTIVE" },
        { id: "o3", tenant_id: "t1", severity: "High", status: "IN_PROGRESS" },
        { id: "o4", tenant_id: "t1", severity: "Low", status: "RESOLVED" },
      ],
    });
    const { signals } = await computeRealBusinessSignals(supabase, "t1");
    assert.equal(signals.searchVisibilityStrength, "none");
    assert.ok(signals.signalEvidenceIds && signals.signalEvidenceIds.length > 0);
  }

  // searchVisibilityStrength: all resolved / no open high severity -> "medium", never fabricated "high".
  {
    const supabase = fakeSupabase({
      search_opportunities: [{ id: "o1", tenant_id: "t1", severity: "Low", status: "RESOLVED" }],
    });
    const { signals } = await computeRealBusinessSignals(supabase, "t1");
    assert.equal(signals.searchVisibilityStrength, "medium");
  }

  // crmFollowUpStrength: heavy overdue follow-up ratio -> "weak"; monthlyInquiries counts real recent rows.
  {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    const supabase = fakeSupabase({
      crm_leads: [
        { id: "l1", tenant_id: "t1", status: "CONTACTED", created_at: iso(5 * 24 * 3600 * 1000), next_follow_up_at: iso(2 * 24 * 3600 * 1000) },
        { id: "l2", tenant_id: "t1", status: "CONTACTED", created_at: iso(3 * 24 * 3600 * 1000), next_follow_up_at: iso(1 * 24 * 3600 * 1000) },
        { id: "l3", tenant_id: "t1", status: "QUALIFIED", created_at: iso(60 * 24 * 3600 * 1000), next_follow_up_at: null },
      ],
    });
    const { signals } = await computeRealBusinessSignals(supabase, "t1");
    assert.equal(signals.crmFollowUpStrength, "weak");
    assert.equal(signals.monthlyInquiries, 2); // l3 is 60 days old, excluded
    // Sample too small (< 5) for a conversion-rate claim -> honestly omitted.
    assert.equal(signals.postContactConversionStrength, undefined);
  }

  // postContactConversionStrength: only computed once sample size is real (>= 5 contacted leads).
  {
    const iso = new Date().toISOString();
    const contacted = (status: string, i: number) => ({ id: `l${i}`, tenant_id: "t1", status, created_at: iso, next_follow_up_at: null });
    const supabase = fakeSupabase({
      crm_leads: [
        contacted("WON", 1),
        contacted("WON", 2),
        contacted("LOST", 3),
        contacted("QUALIFIED", 4),
        contacted("QUALIFIED", 5),
      ],
    });
    const { signals } = await computeRealBusinessSignals(supabase, "t1");
    // 2/5 WON = 40% -> "high"
    assert.equal(signals.postContactConversionStrength, "high");
  }

  console.log("business-signals.test.ts (lib/agent-core): ALL PASS");
}

run();
