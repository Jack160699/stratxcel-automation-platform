// Final Social Copilot product-completion layout contracts.
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-final-product-completion.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const workspace = read("app", "admin", "social", "copilot", "ResizableWorkspace.tsx");
  const fullPage = read("app", "admin", "social", "copilot", "CopilotFullPage.tsx");
  const theme = read("app", "admin", "social", "social-theme.css");
  const publishCard = read("app", "admin", "social", "agent", "PublishApprovalCard.tsx");
  const previewModal = read("app", "admin", "social", "agent", "PlatformPreviewModal.tsx");
  const attachment = read("app", "admin", "social", "agent", "AttachmentMedia.tsx");
  const agentMessage = read("app", "admin", "social", "agent", "AgentMessage.tsx");
  const premium = read("lib", "social", "__tests__", "copilot-premium-workspace.test.ts");
  const finalArtifact = read("lib", "social", "__tests__", "final-artifact-approval-policy.test.ts");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");

  // Center track + Focus/READY overlay drawers (stable card geometry)
  assert.ok(workspace.includes("minmax(0, 1fr)"));
  assert.ok(workspace.includes("overlayRails"));
  assert.ok(workspace.includes("saut-workspace-drawer"));
  assert.ok(workspace.includes("data-overlay-rails"));
  assert.ok(workspace.includes("Open conversations") && workspace.includes("Open activity"));
  assert.ok(workspace.includes("saut-ready-status-chip"));
  assert.ok(!/readyReview \? ["']Ready["']/.test(workspace) || workspace.includes("Open activity"), "activity control must not be only a checkmark");

  // Overlay: READY/Focus uses 0-width rail tracks
  assert.ok(workspace.includes('overlayRails ? "0px"'));

  // Compact READY source strip
  assert.ok(attachment.includes("saut-source-strip"));
  assert.ok(agentMessage.includes("compactSources"));
  assert.ok(fullPage.includes("compactSources={reviewMode}"));
  assert.ok(theme.includes(".saut-source-strip") && theme.includes("max-height: 88px"));

  // Card density — min(100%, Npx) prevents artifact horizontal overflow
  assert.ok(/minmax\(\s*min\(\s*100%\s*,\s*280px\s*\)\s*,\s*1fr\s*\)/.test(theme));
  assert.ok(theme.includes("max-height: 380px") || theme.includes("max-height:380px"));
  assert.ok(theme.includes("max-height: 160px") || /saut-artifact-media[\s\S]*max-height:\s*160px/.test(theme));
  assert.ok(publishCard.includes("saut-artifact-tag-summary"));
  assert.ok(!/preview\.hashtags\.map\(/.test(publishCard));

  // Preview Fit/100% + modal bounds
  assert.ok(previewModal.includes("fitMode") && previewModal.includes("Fit") && previewModal.includes("100%"));
  assert.ok(previewModal.includes("data-preview-mode"));
  assert.ok(theme.includes("min(920px, calc(100vw - 48px))") || theme.includes("calc(100vw - 48px)"));
  assert.ok(theme.includes("calc(100dvh - 40px)"));
  assert.ok(previewModal.includes("onError") || previewModal.includes("avatarFailed"));
  assert.ok(previewModal.includes("View full caption") || previewModal.includes("see more"));
  assert.ok(previewModal.includes("saut-preview-footer") || theme.includes(".saut-preview-footer"));

  // Composer + approval dock budgets
  assert.ok(fullPage.includes("saut-composer-row") && fullPage.includes("is-idle"));
  assert.ok(theme.includes(".saut-sticky-approve") && theme.includes("min-height: 60px"));
  assert.ok(publishCard.includes("createPortal") && fullPage.includes("saut-review-dock"));

  // Mission header simplified (no ambiguous Dock)
  assert.ok(!fullPage.includes(">Dock<"));
  assert.ok(fullPage.includes("Focus") && fullPage.includes(">New<") || (fullPage.includes("Focus") && fullPage.includes("New")));
  assert.ok(fullPage.includes('aria-label={focusMode ? "Exit focus mode"'));
  assert.ok(fullPage.includes("clearAttachments") && fullPage.includes("setSessionId(null)"));

  // Approval safety preserved
  assert.ok(finalArtifact.length > 0);
  assert.ok(orchestrator.includes("approveAgentAction"));
  assert.ok(publishCard.includes("SHADOW MODE"));
  assert.ok(premium.includes("setPreviewOpen(true)"));

  // Scroll ownership markers
  assert.ok(workspace.includes('data-center-scroll-owner="true"') || theme.includes("saut-history-compact"));
  assert.ok(theme.includes(".saut-agent-left") && /saut-agent-left\s*\{[^}]*overflow:\s*hidden/.test(theme.replace(/\n/g, " ")));

  // Drawer must not use in-flow reflow for READY
  assert.ok(workspace.includes("saut-drawer-backdrop"));
  assert.ok(theme.includes(".saut-workspace-drawer"));

  console.log("copilot-final-product-completion.test.ts: ALL PASS");
}

run();
