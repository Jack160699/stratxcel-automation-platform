import assert from "node:assert/strict";
import { preferredAuditWhatsAppBody } from "../../audit/v1/whatsapp-send.ts";

async function testAdminFinanceAndWhatsApp() {
  console.log("Running Admin Finance & WhatsApp First Message Intelligence test...");

  // Test WhatsApp message format
  const body = preferredAuditWhatsAppBody("Ascend Digital", "https://www.stratxcel.in/audit/share/tok123", {
    stage: "Growing",
    topOpportunity: "Improve lead conversion",
    nextStep: "CRM + WhatsApp automation",
  });

  assert.ok(body.includes("Ascend Digital"));
  assert.ok(body.includes("Current stage: Growing"));
  assert.ok(body.includes("Top opportunity: Improve lead conversion"));
  assert.ok(body.includes("Next recommended move: CRM + WhatsApp automation"));
  assert.ok(body.includes("https://www.stratxcel.in/audit/share/tok123"));

  console.log("admin-finance-intelligence.test.ts: ALL PASS");
}

testAdminFinanceAndWhatsApp().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
