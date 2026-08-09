// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/formatter.test.ts
import assert from "node:assert/strict";
import { summarizeToolResult, formatAgentReply, formatConfirmationPrompt, formatWhoAmI, describeToolAction } from "../formatter.ts";

function run() {
  // No raw JSON dumps, no Markdown tables, arrays summarized as top-N + count.
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `lead-${i}`, contact_name: `Lead ${i}`, status: "NEW" }));
  const summary = summarizeToolResult("list_leads", { leads: many });
  assert.ok(!summary.includes("|---"), "must never render a Markdown table");
  assert.ok(summary.includes("12 total"));
  assert.ok(summary.includes("…and 7 more"), "must show top N + remaining count, not the full array");

  const empty = summarizeToolResult("list_leads", { leads: [] });
  assert.ok(empty.includes("none found"));

  const reply = formatAgentReply({ text: "Here you go.", toolSummaries: [summary] });
  assert.ok(reply.length <= 1400, "reply must be bounded in length");
  const privateSummary = summarizeToolResult("list_leads", [{ id: "eb01696d-a902-4517-bad7-25272f31f00b", contact_phone: "919584735857", status: "NEW" }]);
  assert.ok(!privateSummary.includes("eb01696d") && !privateSummary.includes("919584735857"), "tool summaries must omit internal IDs and full phone numbers");
  assert.ok(!privateSummary.includes("list_leads") && privateSummary.includes("Leads"), "fallback summaries must use user-facing labels, not raw tool names");
  const nestedMutation = summarizeToolResult("update_lead_status", { lead: { id: "eb01696d-a902-4517-bad7-25272f31f00b", tenant_id: "84044df2-e94b-423c-bf1f-123456789abc", status: "CONTACTED" } });
  assert.ok(!nestedMutation.includes("eb01696d") && !nestedMutation.includes("84044df2"), "nested tool objects must never serialize internal identifiers");
  assert.equal(describeToolAction("update_lead_status"), "update the lead status");
  const sanitized = formatAgentReply({ text: "Lead eb01696d-a902-4517-bad7-25272f31f00b called from 919584735857." });
  assert.ok(!sanitized.includes("eb01696d") && sanitized.includes("••••••••57"), "final replies must redact internal IDs and mask phone-like identifiers");
  const timestamp = formatAgentReply({ text: "Last interaction: 2026-08-09 01:41:09" });
  assert.ok(timestamp.includes("2026-08-09 01:41:09"), "ISO timestamps must not be mistaken for phone numbers");
  const linkCode = formatAgentReply({ text: "The previous message was LINK ADMIN 657681." });
  assert.ok(!linkCode.includes("657681") && linkCode.includes("LINK [redacted]"), "pairing codes must never be repeated in replies");

  const confirmPrompt = formatConfirmationPrompt({ humanSummary: "Ready to mark as CONTACTED.", code: "482917", ttlMinutes: 10 });
  assert.ok(confirmPrompt.includes("CONFIRM 482917"));
  assert.ok(confirmPrompt.includes("CANCEL 482917"));
  const formattedConfirmation = formatAgentReply({ confirmationPrompt: confirmPrompt });
  assert.ok(formattedConfirmation.includes("CONFIRM 482917") && formattedConfirmation.includes("CANCEL 482917"), "live confirmation challenges must remain usable");

  assert.equal(formatWhoAmI("staff"), "Linked as Stratxcel staff.");
  assert.equal(formatWhoAmI("unlinked"), "WhatsApp is not linked to a Stratxcel account.");
  assert.ok(!formatWhoAmI("staff").match(/[0-9a-f]{8}-[0-9a-f]{4}/i), "must never leak a UUID");

  console.log("formatter.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
