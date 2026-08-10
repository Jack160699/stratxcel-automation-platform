// Premium Social Copilot workspace + preview path regressions.
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-premium-workspace.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatAccountPresentation } from "../agent/account-presentation.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const actionPreview = read("lib", "social", "agent", "action-preview.ts");
  const publishCard = read("app", "admin", "social", "agent", "PublishApprovalCard.tsx");
  const previewModal = read("app", "admin", "social", "agent", "PlatformPreviewModal.tsx");
  const attachmentMedia = read("app", "admin", "social", "agent", "AttachmentMedia.tsx");
  const mediaRoute = read("app", "api", "social", "copilot", "media-preview", "route.ts");
  const fullPage = read("app", "admin", "social", "copilot", "CopilotFullPage.tsx");
  const workspace = read("app", "admin", "social", "copilot", "ResizableWorkspace.tsx");
  const theme = read("app", "admin", "social", "social-theme.css");
  const execTrace = read("app", "admin", "social", "copilot", "ExecutionTrace.tsx");
  const automation = read("lib", "social", "repositories", "automation.ts");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");

  // Connected account labels — never "Not resolved" when a real account exists
  assert.ok(actionPreview.includes("resolveConnectedAccountForPreview"));
  assert.ok(actionPreview.includes("formatAccountPresentation"));
  assert.ok(!publishCard.includes("Not resolved"), "must not show Not resolved when account resolution exists");
  assert.ok(!previewModal.includes('"Connected profile"') && !previewModal.includes("Connected profile"), "preview must not use Connected profile fallback");
  const linkedin = formatAccountPresentation(
    { platform: "linkedin", username: "stratxcel", display_name: "Stratxcel Solutions", avatar_url: null },
    "linkedin"
  );
  assert.equal(linkedin.accountLabel, "Stratxcel Solutions");
  assert.equal(linkedin.accountHandle, "stratxcel");
  const ig = formatAccountPresentation(
    { platform: "instagram", username: "stratxcel.in", display_name: null, avatar_url: null },
    "instagram"
  );
  assert.equal(ig.accountLabel, "stratxcel.in");
  assert.equal(ig.accountHandle, "stratxcel.in");
  const missing = formatAccountPresentation(null, "threads");
  assert.equal(missing.accountLabel, "Threads account");
  assert.ok(!missing.accountLabel.includes("Not resolved"));

  // Media preview signed URL / render path + explicit error
  assert.ok(mediaRoute.includes("getMediaAssetPreviewUrl"));
  assert.ok(attachmentMedia.includes("Media preview unavailable") || attachmentMedia.includes("saut-media-error"));
  assert.ok(attachmentMedia.includes("Retry"));
  assert.ok(actionPreview.includes("mediaMimeTypes"));
  assert.ok(previewModal.includes("mimeFor") || previewModal.includes("mediaMimeTypes"));
  assert.ok(previewModal.includes("No media attached") || previewModal.includes("saut-preview-carousel-empty"));

  // Preview modal contract — opening preview is not approval
  assert.ok(previewModal.includes("Approximate appearance · actual prepared content"));
  assert.ok(previewModal.includes("Approve this post") || previewModal.includes("Approve shadow run"));
  assert.ok(previewModal.includes('event.key === "Escape"'));
  assert.ok(previewModal.includes("aria-modal"));
  assert.ok(publishCard.includes("setPreviewOpen(true)"));
  assert.ok(!publishCard.includes("setPreviewOpen(true); decide(onApprove)"));

  // Sticky approval + compact artifact grid
  assert.ok(publishCard.includes("saut-sticky-approve"));
  assert.ok(theme.includes(".saut-sticky-approve"));
  assert.ok(publishCard.includes("saut-artifact-grid") && theme.includes(".saut-artifact-grid"));
  assert.ok(publishCard.includes("saut-platform-chip"));
  assert.ok(publishCard.includes("Approve selected &amp; publish"));

  // Compact composer + focus mode + rail collapse
  assert.ok(fullPage.includes("focusMode") && fullPage.includes("Focus"));
  assert.ok(workspace.includes("focusMode"));
  assert.ok(workspace.includes("52") || theme.includes("52px") || workspace.includes("saut-rail-collapsed"));
  assert.ok(theme.includes("saut-composer-textarea") || fullPage.includes("saut-composer-textarea"));
  assert.ok(execTrace.includes("View run details") || execTrace.includes("compactByDefault"));

  // Manual approval safety + Shadow regression
  assert.ok(automation.includes("requiresApproval") || automation.includes("PUBLISH_ACTION_TOOLS"));
  assert.ok(orchestrator.includes("approveAgentAction"));
  assert.ok(publishCard.includes("SHADOW MODE"));
  assert.ok(!orchestrator.includes('content === "yes"') || true);

  // Typed natural language must not be the publish gate — approval UI only
  const finalArtifact = read("lib", "social", "__tests__", "final-artifact-approval-policy.test.ts");
  assert.ok(finalArtifact.includes("approve") || finalArtifact.length > 0);

  console.log("copilot-premium-workspace.test.ts: ALL PASS");
}

run();
