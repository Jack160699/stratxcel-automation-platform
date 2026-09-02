import assert from "node:assert/strict";
import { handleWhatsAppCopilotMessage, type CopilotContext } from "../copilot/copilot-agent.ts";
import { ValueLedgerService } from "../../../../lib/reporting/value-ledger.ts";

/**
 * ValueLedgerService is now real, Postgres-backed (value-ledger.ts's own
 * header comment -- fixed from an in-memory Map, Update 60). Stays
 * isolated from any live database via the same constructor injection
 * point the real service supports.
 */
function createFakeLedgerSupabase() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    from(table: string) {
      if (table !== "value_ledger_entries") throw new Error(`unexpected table: ${table}`);
      return {
        insert(row: Record<string, unknown>) {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              const afterFirst = rows.filter((r) => r[column] === value);
              return {
                eq(column2: string, value2: string) {
                  const afterSecond = afterFirst.filter((r) => r[column2] === value2);
                  return { order() { return Promise.resolve({ data: afterSecond, error: null }); } };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testWhatsAppCopilotSuite() {
  console.log("Testing WhatsApp Customer Copilot Flow (Cases 25-26)...");

  const ledger = new ValueLedgerService(createFakeLedgerSupabase());
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Seed sample deliverable in Value Ledger
  await ledger.recordDeliverable({
    tenantId: "tenant-copilot-1",
    cycleMonth: currentMonth,
    serviceKey: "google_business_optimization",
    deliverableTitle: "Google Maps Rank Optimization",
    deliverableSummary: "Updated primary business categories and verified geo-coordinates for nearby search queries.",
    resultMetric: "Discovery Searches",
    resultValue: "+32%",
  });

  const ctx: CopilotContext = {
    tenantId: "tenant-copilot-1",
    businessName: "Verma Medical & Dental Care",
    activePlan: {
      tier: "Standard",
      title: "Standard Growth Plan",
      monthlyPriceRupees: 4999,
      entitledServices: ["google_business_optimization", "review_management", "whatsapp_crm_inbox"],
    },
    pendingApprovals: [
      { id: "appr-101", title: "New Google Business Q&A Updates", kind: "content_publish" },
    ],
    ledger,
  };

  // Case 25: WhatsApp Reporting & Daily Progress
  const todayResponse = await handleWhatsAppCopilotMessage("What did you do today?", ctx);
  assert.equal(todayResponse.intent, "ASK_TODAYS_WORK");
  assert.ok(todayResponse.replyText.includes("Google Maps Rank Optimization"));
  assert.ok(todayResponse.replyText.includes("Verma Medical & Dental Care"));
  console.log("  ✓ Case 25: WhatsApp daily reporting passed");

  // Case 26A: Ask Current Plan
  const planResponse = await handleWhatsAppCopilotMessage("What is my current plan?", ctx);
  assert.equal(planResponse.intent, "ASK_CURRENT_PLAN");
  assert.ok(planResponse.replyText.includes("₹4,999/month"));
  assert.ok(planResponse.replyText.includes("Standard Growth Plan"));

  // Case 26B: Ask Recommendation Reason
  const reasonResponse = await handleWhatsAppCopilotMessage("Why did you recommend this setup?", ctx);
  assert.equal(reasonResponse.intent, "ASK_RECOMMENDATION_REASON");
  assert.ok(reasonResponse.replyText.includes("Local Discovery"));

  // Case 26C: Command Approve (Approval recorded)
  const approveResponse = await handleWhatsAppCopilotMessage("I approve the new updates", ctx);
  assert.equal(approveResponse.intent, "COMMAND_APPROVE");
  assert.equal(approveResponse.actionTaken?.type, "APPROVAL_RECORDED");
  assert.equal(approveResponse.actionTaken?.details?.approvalId, "appr-101");
  assert.ok(approveResponse.replyText.includes("✅ Approved: *New Google Business Q&A Updates*"));

  // Case 26D: Command Execute UNENTITLED Service (Social posting requested on Standard plan without social)
  const unentitledPostResponse = await handleWhatsAppCopilotMessage("Create an Instagram post for tomorrow", ctx);
  assert.equal(unentitledPostResponse.intent, "COMMAND_EXECUTE");
  assert.equal(unentitledPostResponse.actionTaken?.type, "UPGRADE_REQUIRED");
  assert.ok(unentitledPostResponse.replyText.includes("Social Autopilot is not included in your current plan"));
  assert.ok(unentitledPostResponse.replyText.includes("Recommended Premium Plan"));

  console.log("  ✓ Case 26: WhatsApp command authorization & entitlement boundaries passed");
  console.log("whatsapp-copilot-flow.test.ts: ALL PASS");
}

testWhatsAppCopilotSuite().catch((err) => {
  console.error("WhatsApp Copilot test failed:", err);
  process.exit(1);
});
