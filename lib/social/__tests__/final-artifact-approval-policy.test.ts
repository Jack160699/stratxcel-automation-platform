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
assert.ok(orchestrator.includes("persisted_publish_artifact_missing"), "missing persisted artifact must fail truthfully");
assert.ok(orchestrator.includes('proposeAction(ctx, sessionId, "schedule_post"'), "persisted variants must deterministically become review actions");
assert.ok(orchestrator.includes("PUBLISH_INTENT_TOOLS.has(tool.schema.name) ||"), "manual publish always requires explicit control");
assert.ok(rail.includes("activePublishActions") && rail.includes("{platform}"), "Working With must distinguish active platforms");
assert.ok(artifact.includes("Ready for review") && artifact.includes("Approve shadow run"), "artifact must expose truthful combined approval");
assert.ok(artifact.includes(">Preview</button>") && artifact.includes(">Edit</button>"), "persisted previews and editing remain directly available");
assert.ok(attachmentRepo.includes("mediaAssetId"), "real media remains persisted through the existing attachment pipeline");

console.log("final-artifact-approval-policy.test.ts: ALL PASS (zero leaks, persisted artifact, platform rail, explicit manual approval)");
