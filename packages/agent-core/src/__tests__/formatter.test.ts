// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/formatter.test.ts
import assert from "node:assert/strict";
import { summarizeToolResult, formatAgentReply, formatConfirmationPrompt, formatWhoAmI } from "../formatter.ts";

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

  const confirmPrompt = formatConfirmationPrompt({ humanSummary: "Ready to mark as CONTACTED.", code: "482917", ttlMinutes: 10 });
  assert.ok(confirmPrompt.includes("CONFIRM 482917"));
  assert.ok(confirmPrompt.includes("CANCEL 482917"));

  assert.equal(formatWhoAmI("staff"), "Linked as Stratxcel staff.");
  assert.equal(formatWhoAmI("unlinked"), "WhatsApp is not linked to a Stratxcel account.");
  assert.ok(!formatWhoAmI("staff").match(/[0-9a-f]{8}-[0-9a-f]{4}/i), "must never leak a UUID");

  console.log("formatter.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
