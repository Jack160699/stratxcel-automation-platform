import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeUserFacingText } from "../agent/user-facing-text.ts";
import { classifyCreativeRequestMode } from "../agent/gemini-boundary.ts";

const leaked = [
  '{"processingStatus":"STORED_UNREADABLE"}',
  'ONED_UNREADABLE"}',
  'processing_status=EXTRACTED',
  'attachmentId=80a9cb56-6047-4022-80d0-e8b46709fe24 storage_path=x/y.jpg',
  'toolResult={"mediaAssetId":"80a9cb56-6047-4022-80d0-e8b46709fe24"}',
  'com.apple.pasteboard metadata',
];
for (const value of leaked) {
  const safe = sanitizeUserFacingText(value);
  assert.ok(!/STORED_UNREADABLE|ONED_UNREADABLE|EXTRACTED|attachmentId|mediaAssetId|storage_path|com\.apple|[{}]/i.test(safe), `internal value leaked: ${value}`);
}

for (const prompt of ["bana do", "kar do", "ready kar do", "best use karo", "final karo", "go ahead", "prepare it", "make this final"]) {
  assert.equal(classifyCreativeRequestMode(prompt, true), "EXECUTE", `preparation intent missed: ${prompt}`);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const orchestrator = fs.readFileSync(path.join(root, "lib/social/agent/orchestrator.ts"), "utf8");
const rail = fs.readFileSync(path.join(root, "app/admin/(shell)/social/copilot/CopilotFullPage.tsx"), "utf8");
const artifact = fs.readFileSync(path.join(root, "app/admin/(shell)/social/agent/PublishApprovalCard.tsx"), "utf8");
const attachmentRepo = fs.readFileSync(path.join(root, "lib/social/repositories/agent-attachments.ts"), "utf8");

assert.ok(!orchestrator.includes("processingStatus=${attachment.processingStatus}"), "processing enum must not reach the model");
// fix(growth-assistant): unblock creative post execution and eliminate false
// review_artifact_missing human review error — the named
// persisted_publish_artifact_missing failure was replaced by a narrower,
// correct rule: only fail when the turn produced *nothing at all* (no
// publish artifact, no generated candidates, no meaningful text). A turn
// that legitimately produced candidates/text without a publish artifact no
// longer false-positives; a genuinely empty turn still fails truthfully via
// hasPublishArtifact/hasGeneratedCandidates/hasMeaningfulText below.
assert.ok(orchestrator.includes("hasPublishArtifact") && orchestrator.includes("hasGeneratedCandidates") && orchestrator.includes("hasMeaningfulText"), "empty turns must still fail truthfully");
assert.ok(orchestrator.includes("Only fail if turn produced absolutely nothing"), "failure must remain scoped to genuinely empty turns, not merely missing a publish artifact");
assert.ok(orchestrator.includes('proposeAction(ctx, sessionId, "schedule_post"'), "persisted variants must deterministically become review actions");
assert.ok(orchestrator.includes("PUBLISH_INTENT_TOOLS.has(tool.schema.name) ||"), "manual publish always requires explicit control");
assert.ok(rail.includes("activePublishActions") && rail.includes("{platform}"), "Working With must distinguish active platforms");
assert.ok(artifact.includes("Ready for review") && artifact.includes("Approve shadow run"), "artifact must expose truthful combined approval");
assert.ok(artifact.includes(">Preview</button>") && artifact.includes(">Edit</button>"), "persisted previews and editing remain directly available");
assert.ok(attachmentRepo.includes("mediaAssetId"), "real media remains persisted through the existing attachment pipeline");

console.log("final-artifact-approval-policy.test.ts: ALL PASS (zero leaks, persisted artifact, platform rail, explicit manual approval)");
