// Run with: node --experimental-strip-types lib/agent-core/__tests__/revenue-diagnostics.test.ts
import assert from "node:assert/strict";
import { computeRealLeadRows, computeRealMessageDerivedFacts, computeRealConsentByLeadId } from "../revenue-diagnostics.ts";

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
  // computeRealLeadRows: direct real mapping, unrecognized real source values normalized safely.
  {
    const supabase = fakeSupabase({
      crm_leads: [
        { id: "l1", tenant_id: "t1", source: "whatsapp_outreach", contact_name: "A", contact_phone: null, contact_email: null, status: "NEW", metadata: {}, tags: null, assigned_to: null, last_interaction_at: null, next_follow_up_at: null, notes: null, created_at: "2026-08-01T00:00:00Z" },
        { id: "l2", tenant_id: "t1", source: "website_form", contact_name: "B", contact_phone: null, contact_email: null, status: "CONTACTED", metadata: {}, tags: null, assigned_to: null, last_interaction_at: null, next_follow_up_at: null, notes: null, created_at: "2026-08-02T00:00:00Z" },
      ],
    });
    const rows = await computeRealLeadRows(supabase, "t1");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.source, "whatsapp"); // whatsapp_outreach normalized, never dropped
    assert.equal(rows[1]!.source, "website_form");
  }

  // computeRealMessageDerivedFacts: real firstOutbound/hasPendingInbound from real message ordering.
  {
    const leads = [
      { id: "l1", status: "NEW" as const, created_at: "2026-08-01T00:00:00Z", next_follow_up_at: null },
      { id: "l2", status: "CONTACTED" as const, created_at: "2026-08-01T00:00:00Z", next_follow_up_at: null },
      { id: "l3", status: "NEW" as const, created_at: "2026-08-01T00:00:00Z", next_follow_up_at: null }, // no messages at all
    ];
    const supabase = fakeSupabase({
      whatsapp_messages: [
        { id: "m1", tenant_id: "t1", lead_id: "l1", direction: "outbound", body: "hello", created_at: "2026-08-01T02:00:00Z" },
        { id: "m2", tenant_id: "t1", lead_id: "l1", direction: "inbound", body: "hi back", created_at: "2026-08-01T03:00:00Z" },
        { id: "m3", tenant_id: "t1", lead_id: "l2", direction: "inbound", body: "still waiting", created_at: "2026-08-01T05:00:00Z" },
      ],
    });
    const { timingSamples, lastOutboundAtByLeadId, latestInboundBodyByLeadId } = await computeRealMessageDerivedFacts(supabase, "t1", leads);
    assert.equal(timingSamples.length, 3);

    const l1 = timingSamples.find((s) => s.leadId === "l1")!;
    assert.equal(l1.firstOutboundAtIso, "2026-08-01T02:00:00Z");
    assert.equal(l1.hasPendingInbound, true); // last message on l1's thread is inbound
    assert.equal(lastOutboundAtByLeadId.l1, "2026-08-01T02:00:00Z");
    assert.equal(latestInboundBodyByLeadId.l1, "hi back");

    const l2 = timingSamples.find((s) => s.leadId === "l2")!;
    assert.equal(l2.firstOutboundAtIso, null); // never contacted -- honest null, not fabricated
    assert.equal(l2.hasPendingInbound, true);
    assert.equal(lastOutboundAtByLeadId.l2, undefined);

    const l3 = timingSamples.find((s) => s.leadId === "l3")!;
    assert.equal(l3.firstOutboundAtIso, null);
    assert.equal(l3.hasPendingInbound, false); // no messages at all -- honestly not "pending"
  }

  // computeRealConsentByLeadId: real opted_in/opted_out_at mapping.
  {
    const supabase = fakeSupabase({
      contact_consent: [
        { id: "c1", tenant_id: "t1", lead_id: "l1", opted_in: true, opted_out_at: null, source: "whatsapp_reply" },
        { id: "c2", tenant_id: "t1", lead_id: "l2", opted_in: null, opted_out_at: "2026-08-05T00:00:00Z", source: "explicit_opt_out" },
      ],
    });
    const byLead = await computeRealConsentByLeadId(supabase, "t1");
    assert.equal(byLead.l1!.optedIn, true);
    assert.equal(byLead.l1!.optedOut, false);
    assert.equal(byLead.l2!.optedOut, true);
    assert.equal(byLead.l3, undefined); // no consent row -- honestly absent, never defaulted to a guess
  }

  console.log("revenue-diagnostics.test.ts (lib/agent-core): ALL PASS");
}

run();
