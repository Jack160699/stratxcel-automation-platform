// Tests for Copilot presentation-mode helpers: session-history recency
// grouping (Today/Yesterday/This week/Older — see session-groups.ts and
// copilot-session-groups.test.ts for the dedicated grouping/default-open
// coverage), per-page contextual quick actions, and a safety check that
// only presentation state (never conversation content) is persisted to
// localStorage.
//
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-presentation.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupSessionsByRecency } from "../../../app/admin/(shell)/social/copilot/session-groups.ts";
import { quickActionsForPath, contextChipForPath } from "../../../app/admin/(shell)/social/copilot/quick-actions.ts";
import type { AgentSessionRow } from "../repositories/agent.ts";

function session(id: string, updatedAt: string): AgentSessionRow {
  return { id, owner_id: "owner-1", title: `Session ${id}`, status: "READY", context: {}, created_at: updatedAt, updated_at: updatedAt };
}

function run() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const olderStart = new Date(todayStart.getTime() - 30 * 86400000);
  const today = todayStart.toISOString();
  const yesterday = yesterdayStart.toISOString();
  const older = olderStart.toISOString();

  // 1. Sessions group into real, honest recency buckets — no fabricated history.
  const groups = groupSessionsByRecency([session("a", today), session("b", yesterday), session("c", older)], now);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[0].sessions.length, 1);
  assert.equal(groups[1].label, "Yesterday");
  assert.equal(groups[2].label, "Older");
  assert.equal(groups[2].sessions[0].id, "c");

  // 2. Most-recent buckets first (Today, then Yesterday, then Older).
  const days = groups.map((g) => g.label);
  assert.deepEqual(days, ["Today", "Yesterday", "Older"]);

  // 3. Empty input never fabricates a group.
  assert.deepEqual(groupSessionsByRecency([], now), []);

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
  const contextPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "admin", "(shell)", "social", "copilot", "CopilotContext.tsx");
  const source = fs.readFileSync(contextPath, "utf8");
  assert.equal(source.includes("localStorage"), false, "canonical Social context must not persist a separate dock presentation model");
  assert.ok(source.includes("sessionId") && source.includes("setSessionId"));
  assert.ok(!source.includes("messages"), "CopilotContext must never reference message content directly — that stays server-side");

  const fullPagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "admin", "(shell)", "social", "copilot", "CopilotFullPage.tsx");
  const fullPage = fs.readFileSync(fullPagePath, "utf8");
  for (const behavior of ["saut-unified-composer", "MediaRecorder", "onPaste", "uploadState", "event.shiftKey", "revokeObjectURL"]) {
    assert.ok(fullPage.includes(behavior), `unified composer must preserve ${behavior}`);
  }
  const previewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "admin", "(shell)", "social", "agent", "PlatformPreviewModal.tsx");
  const preview = fs.readFileSync(previewPath, "utf8");
  for (const platform of ["instagram", "linkedin", "facebook", "threads", "youtube"]) assert.ok(preview.includes(platform));
  assert.ok(preview.includes('event.key === "Escape"'), "preview must close with Escape");
  assert.ok(preview.includes('event.key === "Tab"'), "preview must trap keyboard focus");

  const transcriptionPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "api", "social", "copilot", "transcribe", "route.ts");
  const transcription = fs.readFileSync(transcriptionPath, "utf8");
  for (const forbidden of ["admitMemoryCandidate", "createOpenLoop", "createVoiceNote", "saveTranscript"]) {
    assert.equal(transcription.includes(forbidden), false, `Social voice transcription must not call ${forbidden}`);
  }

  console.log("copilot-presentation.test.ts: ALL PASS (session grouping, composer, previews, voice isolation)");
}

run();
