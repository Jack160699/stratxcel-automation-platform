// Tests the production-test cleanup fixes (live-progress cleanup brief):
// no false "queued" wording before a publishing job exists, "post it" means
// publish now rather than an invented future time, and the right rail's
// fixed live-console layout / auto-follow wiring. Verified via source text
// since the relevant modules' graphs (Supabase-backed repositories, "use
// client" React components) can't be resolved standalone under
// `node --experimental-strip-types` — same technique as
// media-ingestion.test.ts / workspace-safety.test.ts.
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-live-progress.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  const tools = read("lib", "social", "agent", "tools.ts");
  const actionPreview = read("lib", "social", "agent", "action-preview.ts");
  const theme = read("app", "admin", "social", "social-theme.css");
  const resizable = read("app", "admin", "social", "copilot", "ResizableWorkspace.tsx");
  const execTrace = read("app", "admin", "social", "copilot", "ExecutionTrace.tsx");
  const copilotFullPage = read("app", "admin", "social", "copilot", "CopilotFullPage.tsx");
  const executionStages = read("app", "admin", "social", "copilot", "execution-stages.ts");

  // --- Section 1: no false "queued" before a publishing job exists. ---
  assert.ok(
    !orchestrator.includes("has been queued (not executed)"),
    "the internal approval-pending tool message must not say a publish was queued before any job exists"
  );
  assert.ok(
    orchestrator.includes("prepared and awaiting your approval") || orchestrator.includes("is prepared and awaiting your approval"),
    "the pre-approval state must be described as prepared/awaiting approval, not queued"
  );
  assert.ok(
    /prepared and awaiting your approval.*never.*queued/is.test(orchestrator) ||
      (orchestrator.includes('"prepared and awaiting your approval"') && orchestrator.includes("never")),
    "the system prompt must instruct evidence-based pre-approval wording"
  );

  // --- Section 2: "post it" means publish now, never an invented future time. ---
  assert.ok(!tools.includes('required: ["accountId", "variantId", "scheduledAt"]'), "scheduledAt must no longer be a forced argument");
  assert.ok(tools.includes('required: ["variantId"]'), "schedule_post must allow omitting scheduledAt and resolving the account locally");
  assert.ok(tools.includes('str(args, "platform") || variant.platform'), "schedule_post must derive the destination platform locally");
  assert.ok(tools.includes('.eq("status", "CONNECTED")'), "only connected accounts may be resolved for publishing");
  assert.ok(
    tools.includes('str(args, "scheduledAt") || new Date().toISOString()'),
    "an omitted scheduledAt must default to right now, not force the model to invent a time"
  );
  assert.ok(
    /Omit\s+scheduledAt/.test(orchestrator) || orchestrator.includes("omit scheduledAt"),
    "the system prompt must tell the model to omit scheduledAt for a plain 'post it now' request"
  );
  assert.ok(
    actionPreview.includes("!scheduledAt || new Date(scheduledAt).getTime()"),
    "the approval-card preview must treat an absent scheduledAt as Now, not as a mystery future time"
  );

  // --- Section 4: hashtag de-duplication wired into the real preview builder. ---
  assert.ok(actionPreview.includes("dedupeCaptionForPreview"), "the approval card preview must dedupe caption/hashtag overlap");
  assert.ok(fs.existsSync(path.join(root, "lib", "social", "agent", "caption-format.ts")), "expected the pure caption-dedupe module");

  // --- Section 3: recovered stage status (execution-stages.ts logic itself is unit-tested in copilot-execution-stages.test.ts). ---
  assert.ok(executionStages.includes("recovered:"), "ExecutionStage must carry a recovered flag");
  assert.ok(execTrace.includes("stage.recovered"), "the stage row must surface the recovered indicator, not just a bare red/green status");

  // --- Sections 5/6/12/13: right rail is a fixed live console, not a growing document. ---
  assert.ok(!theme.includes(".saut-agent-rail { min-width: 0; overflow-y: auto;"), "the shared rail rule must no longer force a single-blob scrollbar");
  assert.ok(theme.includes(".saut-agent-right {") && /\.saut-agent-right\s*\{[^}]*overflow:\s*hidden/.test(theme), "the right rail itself must never scroll as one blob");
  assert.ok(
    resizable.includes("flex h-full min-h-0 min-w-0 flex-col overflow-hidden") ||
      resizable.includes("flex min-h-0 min-w-0 flex-col overflow-hidden"),
    "the right <aside> must be a non-scrolling flex column"
  );
  assert.ok(/\.saut-workspace-progress\s*\{[^}]*flex:\s*1 1 auto/.test(theme), "Progress must be the flexible region that absorbs remaining rail height");
  assert.ok(/\.saut-workspace-context\s*\{[^}]*max-height/.test(theme), "the bottom Context/Working With/Connected Systems cluster must have a bounded height, not grow unbounded");
  assert.ok(theme.includes(".saut-stage-list {") && /\.saut-stage-list\s*\{[^}]*overflow-y:\s*auto/.test(theme), "the stage list is the ONE scrolling region for execution history");
  assert.ok(copilotFullPage.includes("saut-progress-rail") && copilotFullPage.includes("saut-progress-module"), "CopilotFullPage must mark the Progress module as the flexible one");

  // --- Sections 8/9/10/11: auto-follow the active stage, not every raw event. ---
  assert.ok(execTrace.includes("activeStageKey"), "ExecutionTrace must track which stage the viewport should follow");
  assert.ok(execTrace.includes("stageListRef") && execTrace.includes("viewport.scrollTo"), "the active stage must auto-follow inside the event viewport");
  assert.equal(execTrace.includes("scrollIntoView"), false, "auto-follow must never scroll outer page/rail ancestors");
  assert.ok(
    execTrace.includes("}, [activeKey]);") || /useEffect\([^)]*\[activeKey\]/.test(execTrace),
    "auto-follow must fire only when the ACTIVE STAGE changes, not on every event — must depend on activeKey, not raw events"
  );
  assert.ok(
    !/useEffect\([^)]*scrollTo[^)]*\[events\]/.test(execTrace),
    "auto-follow must not be wired to fire on every raw event append (jitter)"
  );

  // --- Section 7: Currently stays visible / correct waiting-for-approval copy is untouched from the prior round. ---
  assert.ok(execTrace.includes("Currently") && execTrace.includes("waitingForApproval"), "the Currently banner must still reflect the waiting-for-approval state");
  assert.ok(/\.saut-progress-rail\s*>\s*\.saut-progress-module\s*>\s*\.saut-rail-module-summary\s*\{[^}]*position:\s*sticky/.test(theme), "the Progress title must remain fixed above its body");
  assert.ok(theme.includes(".saut-current-action") && execTrace.includes("shrink-0"), "Currently must remain outside and above the scrollable event list");
  assert.ok(executionStages.includes('"Ready for your approval"'));

  // --- Section 15: the one-approval publishing flow from the prior round remains intact. ---
  const publishCard = read("app", "admin", "social", "agent", "PublishApprovalCard.tsx");
  assert.ok(publishCard.includes("Approve selected &amp; publish"));
  assert.ok(publishCard.includes("Recommended") && publishCard.includes("Optional"));
  assert.ok(publishCard.includes('aria-label="Platform previews"'));
  assert.ok(publishCard.includes("SHADOW MODE"));
  const automation = read("lib", "social", "repositories", "automation.ts");
  assert.ok(automation.includes("LOW_RISK_PREPARATION_TOOLS"));

  console.log("copilot-live-progress.test.ts: ALL PASS (no false queued, Publish Now default, hashtag dedupe, fixed right-rail console, auto-follow wiring, single-approval flow intact)");
}

run();
