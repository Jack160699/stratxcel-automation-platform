// Tests the Progress-rail stage grouping (Section 3 of the workspace repair
// brief): the raw chronological event trace collapses into a handful of
// human-operational stages instead of flooding the rail with every
// "Generating response"/"Response received" round-trip as a top-level row.
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-execution-stages.test.ts

import assert from "node:assert/strict";
import { groupEventsIntoStages, currentActionLabel, activeStageKey, STAGE_TITLES } from "../../../app/admin/(shell)/social/copilot/execution-stages.ts";
import type { AgentRunEventRow } from "../repositories/agent-runs.ts";

let seq = 0;
function evt(partial: Partial<AgentRunEventRow> & { type: AgentRunEventRow["type"]; label: string }): AgentRunEventRow {
  seq += 1;
  return {
    id: `evt-${seq}`,
    run_id: "run-1",
    tool_name: null,
    status: "INFO",
    meta: {},
    created_at: new Date(2026, 7, 10, 0, 0, seq).toISOString(),
    ...partial,
  };
}

function run() {
  const events: AgentRunEventRow[] = [
    evt({ type: "RUN_STARTED", label: "Starting" }),
    evt({ type: "UNDERSTANDING_REQUEST", label: "Understanding your request" }),
    evt({ type: "PROVIDER_REQUEST_STARTED", label: "Generating response" }),
    evt({ type: "PROVIDER_RESPONSE_RECEIVED", label: "Response received", status: "SUCCESS", meta: { durationMs: 800 } }),
    evt({ type: "TOOL_STARTED", label: "Reading Brand Brain", tool_name: "inspect_brand" }),
    evt({ type: "TOOL_COMPLETED", label: "Reading Brand Brain", tool_name: "inspect_brand", status: "SUCCESS", meta: { durationMs: 200 } }),
    evt({ type: "PROVIDER_REQUEST_STARTED", label: "Generating response" }),
    evt({ type: "PROVIDER_RESPONSE_RECEIVED", label: "Response received", status: "SUCCESS", meta: { durationMs: 1200 } }),
    evt({ type: "TOOL_STARTED", label: "Creating content concept", tool_name: "create_content_item" }),
    evt({ type: "TOOL_COMPLETED", label: "Creating content concept", tool_name: "create_content_item", status: "SUCCESS", meta: { durationMs: 150 } }),
    evt({ type: "TOOL_STARTED", label: "Preparing platform variant", tool_name: "create_content_variant" }),
    evt({ type: "TOOL_COMPLETED", label: "Preparing platform variant", tool_name: "create_content_variant", status: "SUCCESS", meta: { durationMs: 300 } }),
    evt({ type: "TOOL_STARTED", label: "Ingesting uploaded media", tool_name: "ingest_media" }),
    evt({ type: "TOOL_FAILED", label: "Ingesting uploaded media", tool_name: "ingest_media", status: "FAILED", meta: { reason: "attachment not found" } }),
    evt({ type: "RUN_COMPLETED", label: "Completed", status: "SUCCESS", meta: { missionOutcome: "FAILED" } }),
  ];

  const stages = groupEventsIntoStages(events, "COMPLETED");

  // Consecutive tool calls in the same stage collapse into one segment —
  // create_content_item + create_content_variant are both "Content Planning".
  const titles = stages.map((stage) => stage.title);
  assert.deepEqual(titles, [
    STAGE_TITLES.understanding,
    STAGE_TITLES.brand,
    STAGE_TITLES.content,
    STAGE_TITLES.media,
    STAGE_TITLES.final,
  ]);

  const [understanding, brand, content, media, final] = stages;

  // Understanding bundles RUN_STARTED/UNDERSTANDING_REQUEST and the leading
  // provider round-trip that precedes the first tool call — never a
  // top-level "Generating response"/"Response received" pair of its own.
  assert.equal(understanding.events.length, 4);
  assert.equal(understanding.providerCalls, 1);
  assert.equal(understanding.providerDurationMs, 800);
  assert.equal(understanding.status, "success");

  // inspect_brand's own round trip, plus the provider round-trip that
  // follows it (before the next tool call starts), are both summarized
  // inside the Brand stage rather than shown as their own top-level rows.
  assert.equal(brand.providerCalls, 1);
  assert.equal(brand.providerDurationMs, 1200);
  assert.equal(brand.status, "success");
  assert.equal(brand.durationMs, 200 + 1200);

  // Two tool calls merged into one Content Planning stage.
  assert.equal(content.providerCalls, 0);
  assert.equal(content.durationMs, 150 + 300);
  assert.equal(content.status, "success");

  // A failed tool call marks its stage FAILED with the real reason preserved on the event.
  assert.equal(media.status, "failed");
  assert.equal(media.events.find((event) => event.type === "TOOL_FAILED")?.meta.reason, "attachment not found");

  // RUN_COMPLETED always lands in its own trailing Final Result stage.
  assert.equal(final.id, "final");
  assert.equal(final.events.length, 1);

  // A still-RUNNING run's last stage reports "running" (pulses in the UI) when nothing failed.
  const runningEvents = events.slice(0, 12); // ends mid create_content_variant, no RUN_COMPLETED yet
  const runningStages = groupEventsIntoStages(runningEvents, "RUNNING");
  assert.equal(runningStages[runningStages.length - 1].status, "running");

  // currentActionLabel: only meaningful while actually running.
  assert.equal(currentActionLabel(events, true), "Completed");
  assert.equal(currentActionLabel(events, false), null, "no 'Currently…' banner once the run is done");
  assert.equal(currentActionLabel([], true), null);

  // --- Recovered tool retry must not leave the whole stage FAILED (Section 3). ---
  const recoveredEvents: AgentRunEventRow[] = [
    evt({ type: "RUN_STARTED", label: "Starting" }),
    evt({ type: "TOOL_STARTED", label: "Creating content concept", tool_name: "create_content_item" }),
    evt({
      type: "TOOL_FAILED",
      label: "Creating content concept",
      tool_name: "create_content_item",
      status: "FAILED",
      meta: { reason: 'Content pillar must match a saved Brand Brain value. Available: AI Agents & Autonomous Systems, ...' },
    }),
    evt({ type: "TOOL_STARTED", label: "Creating content concept", tool_name: "create_content_item" }),
    evt({ type: "TOOL_COMPLETED", label: "Creating content concept", tool_name: "create_content_item", status: "SUCCESS", meta: { durationMs: 180 } }),
    evt({ type: "TOOL_STARTED", label: "Checking connected accounts", tool_name: "inspect_accounts" }),
    evt({ type: "TOOL_COMPLETED", label: "Checking connected accounts", tool_name: "inspect_accounts", status: "SUCCESS", meta: { durationMs: 90 } }),
  ];
  const recoveredStages = groupEventsIntoStages(recoveredEvents, "RUNNING");
  const recoveredContent = recoveredStages.find((stage) => stage.id === "content");
  assert.ok(recoveredContent, "expected a Content Planning stage");
  assert.equal(recoveredContent!.status, "success", "a retry that ultimately succeeds must not leave the stage FAILED");
  assert.equal(recoveredContent!.recovered, true, "the stage must note it recovered after a retry");
  // The original failed attempt stays visible, never hidden.
  assert.ok(recoveredContent!.events.some((event) => event.type === "TOOL_FAILED"), "the failed attempt must remain in the stage's own events");
  assert.match(String(recoveredContent!.events.find((event) => event.type === "TOOL_FAILED")?.meta.reason), /Content pillar must match/);

  // An UNrecovered failure (nothing after it succeeds) keeps the stage FAILED.
  const unrecoveredStages = groupEventsIntoStages(recoveredEvents.slice(0, 3), "RUNNING");
  const unrecoveredContent = unrecoveredStages.find((stage) => stage.id === "content");
  assert.equal(unrecoveredContent!.status, "failed");
  assert.equal(unrecoveredContent!.recovered, false);

  // --- activeStageKey: what the Progress viewport should auto-follow. ---
  assert.equal(activeStageKey([]), null);
  assert.equal(activeStageKey(recoveredStages), recoveredStages[recoveredStages.length - 1].key, "with nothing pending/failed, the active stage is the last one");
  assert.equal(activeStageKey(unrecoveredStages), unrecoveredContent!.key, "a failed stage is the active one to follow, even if it isn't last");

  console.log("copilot-execution-stages.test.ts: ALL PASS (stage merging, provider round-trip summarization, recovered-retry status, active-stage tracking, Currently banner)");
}

run();
