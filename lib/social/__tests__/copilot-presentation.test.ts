// Tests for Copilot presentation-mode helpers: session-history day grouping,
// per-page contextual quick actions, and a safety check that only
// presentation state (never conversation content) is persisted to
// localStorage.
//
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-presentation.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupSessionsByDay } from "../../../app/admin/social/copilot/session-groups.ts";
import { quickActionsForPath, contextChipForPath } from "../../../app/admin/social/copilot/quick-actions.ts";
import type { AgentSessionRow } from "../repositories/agent.ts";

function session(id: string, updatedAt: string): AgentSessionRow {
  return { id, owner_id: "owner-1", title: `Session ${id}`, status: "READY", context: {}, created_at: updatedAt, updated_at: updatedAt };
}

function run() {
  const now = new Date();
  const today = now.toISOString();
  const yesterday = new Date(now.getTime() - 26 * 3600 * 1000).toISOString(); // safely into "yesterday" regardless of time-of-day
  const older = new Date(now.getTime() - 5 * 86400000).toISOString();

  // 1. Sessions group into real, honest day buckets — no fabricated history.
  const groups = groupSessionsByDay([session("a", today), session("b", yesterday), session("c", older)]);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[0].sessions.length, 1);
  assert.equal(groups[1].label, "Yesterday");
  assert.equal(groups[2].sessions[0].id, "c");

  // 2. Newest day group first (most recent activity surfaces first).
  const days = groups.map((g) => g.label);
  assert.deepEqual(days, ["Today", "Yesterday", older.slice(0, 10)]);

  // 3. Empty input never fabricates a group.
  assert.deepEqual(groupSessionsByDay([]), []);

  // 4. Contextual quick actions match the mission's approved phrase list per page.
  assert.deepEqual(quickActionsForPath("/admin/social/brand"), ["Summarize Brand Brain", "Find missing context"]);
  assert.deepEqual(quickActionsForPath("/admin/social/create"), ["Draft a LinkedIn post", "Create variants"]);
  assert.deepEqual(quickActionsForPath("/admin/social/planner"), ["Plan next week", "Check scheduled posts"]);
  assert.deepEqual(quickActionsForPath("/admin/social/analytics"), ["Analyze recent performance"]);
  assert.deepEqual(quickActionsForPath("/admin/social"), ["Check system health", "Plan this week"]);

  // 5. Context chip reflects the real current page, never a fabricated one.
  assert.equal(contextChipForPath("/admin/social/brand"), "Brand Brain");
  assert.equal(contextChipForPath("/admin/social/copilot"), null);

  // 6. CopilotContext must only ever persist presentation-mode fields to
  // localStorage — never conversation/message content (checked via source
  // text since it's a "use client" React module not importable standalone).
  const contextPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "admin", "social", "copilot", "CopilotContext.tsx");
  const source = fs.readFileSync(contextPath, "utf8");
  const setItemCalls = source.match(/localStorage\.setItem\([^)]*\)/g) ?? [];
  assert.ok(setItemCalls.length > 0, "expected at least one localStorage.setItem call");
  for (const call of setItemCalls) {
    assert.ok(call.includes("JSON.stringify(state)"), `localStorage write must persist only the presentation \`state\` object, got: ${call}`);
  }
  assert.ok(!source.includes("messages"), "CopilotContext must never reference message content directly — that stays server-side");

  console.log("copilot-presentation.test.ts: ALL PASS (session grouping, contextual quick actions, presentation-only persistence)");
}

run();
