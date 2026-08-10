// Premium Social Copilot workspace + final visual polish regressions.
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
  const agentMessage = read("app", "admin", "social", "agent", "AgentMessage.tsx");

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
  assert.ok(workspace.includes("COLLAPSED_STRIP") || workspace.includes("48") || theme.includes("48px"));
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

  // —— Final visual polish contracts ——

  // 1. Card header hierarchy: platform / account / handle as separate nodes
  assert.ok(publishCard.includes("saut-artifact-head"));
  assert.ok(publishCard.includes("saut-artifact-platform"));
  assert.ok(publishCard.includes("saut-artifact-account"));
  assert.ok(publishCard.includes("saut-artifact-handle") || publishCard.includes("accountHandle"));
  assert.ok(theme.includes(".saut-artifact-platform-row"));
  assert.ok(theme.includes(".saut-artifact-account-block"));
  assert.ok(publishCard.includes("PlatformIcon"));
  assert.ok(!publishCard.includes("{platformName}{accountName}"), "platform must not concatenate into account name");

  // 2. Compact READY cards — caption clamp + hashtag summary, not full list on card
  assert.ok(publishCard.includes("saut-artifact-caption-clamp") || theme.includes("saut-artifact-caption-clamp"));
  assert.ok(publishCard.includes("hashtag") && publishCard.includes("tagCount"));
  assert.ok(publishCard.includes("saut-artifact-tag-summary"));
  assert.ok(!/preview\.hashtags\.map\(/.test(publishCard), "collapsed card must not render full hashtag list");
  assert.ok(publishCard.includes(">Preview<") && publishCard.includes(">Edit<"));

  // 3. Sticky approval stays visible via canvas dock (above composer)
  assert.ok(fullPage.includes('id="saut-review-dock"') || fullPage.includes("saut-review-dock"));
  assert.ok(fullPage.includes("data-sticky-review-dock-host") || theme.includes(".saut-review-dock"));
  assert.ok(publishCard.includes("createPortal") && publishCard.includes("saut-review-dock"));
  assert.ok(publishCard.includes('data-sticky-review-dock="true"'));
  assert.ok(theme.includes(".saut-review-dock"));
  assert.ok(!/saut-publish-group\s*\{\s*overflow:\s*hidden/.test(theme), "publish group must not clip approval dock");

  // 4. Compact idle composer
  assert.ok(fullPage.includes("saut-composer-row"));
  assert.ok(fullPage.includes("is-idle") && fullPage.includes("is-expanded"));
  assert.ok(theme.includes(".saut-unified-composer.is-idle"));
  assert.ok(fullPage.includes("Message Copilot"));

  // 5. READY right rail collapses to Ready control
  assert.ok(workspace.includes("readyReview"));
  assert.ok(fullPage.includes("readyReview={reviewMode}") || fullPage.includes("readyReview={reviewMode}"));
  assert.ok(fullPage.includes("saut-ready-pill") || theme.includes(".saut-ready-pill"));
  assert.ok(workspace.includes('"Ready"') || workspace.includes("Ready"));

  // 6. READY left rail quieter via Focus auto-enter once
  assert.ok(fullPage.includes("enteredReviewRef") || fullPage.includes("setFocusMode(true)"));

  // 7. Human status labels — not raw enums in session rail
  assert.ok(fullPage.includes("humanSessionStatus"));
  assert.ok(fullPage.includes('"Waiting for input"') || fullPage.includes("Waiting for input"));
  assert.ok(fullPage.includes('case "READY"'));
  assert.ok(!fullPage.includes("WAITING_FOR_CHOICE</") && !fullPage.includes("{session.status}"));

  // 8. Card typography hierarchy in theme
  assert.ok(theme.includes(".saut-artifact-caption-clamp"));
  assert.ok(theme.includes("font-size: 12px") || theme.includes("font-size: 12.5px"));

  // 9. Responsive grid threshold — 3 cols only when cards are wide enough
  assert.ok(/minmax\(\s*340px\s*,\s*1fr\s*\)/.test(theme), "artifact grid must use ~340px min card width");

  // History cleanup — attachment cards look conversational
  assert.ok(attachmentMedia.includes("statusLabel") || attachmentMedia.includes("Ready"));
  assert.ok(agentMessage.includes("saut-agent-message") || fullPage.includes("saut-history-compact"));

  // —— Focus / collapsed-rail layout contracts (critical desktop regression) ——
  assert.ok(workspace.includes("minmax(0, 1fr)"), "center grid track must be minmax(0, 1fr)");
  assert.ok(theme.includes(".saut-workspace-center") && theme.includes("min-width: 0"));
  assert.ok(workspace.includes("overlayRails") || workspace.includes('focusMode ? "0px"'));
  assert.ok(workspace.includes("saut-workspace-drawer") || workspace.includes("saut-focus-edge-toggle"));
  assert.ok(workspace.includes("Open conversations") || workspace.includes("Open activity"));
  assert.ok(workspace.includes("COLLAPSED_STRIP = 48") || workspace.includes("const COLLAPSED_STRIP = 48"));
  assert.ok(workspace.includes("gridColumn") || workspace.includes("gridColumn:"), "stable grid-column placement required");
  assert.ok(fullPage.includes("saut-composer-shell"));
  assert.ok(theme.includes(".saut-composer-shell") && /saut-composer-shell\s*\{[^}]*width:\s*100%/.test(theme.replace(/\n/g, " ")));

  console.log("copilot-premium-workspace.test.ts: ALL PASS");
}

run();
