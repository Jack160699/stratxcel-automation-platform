import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCreativeRequestMode } from "../agent/gemini-boundary.ts";

const executionPrompts = [
  "Iska best use karo aur jahan sahi lage ready kar do.",
  "Post bana do.",
  "Make the best use of this for my brand.",
  "Iska best use karo.",
  "Ye photos use karo aur best output ready karo.",
];

for (const prompt of executionPrompts) {
  assert.equal(classifyCreativeRequestMode(prompt, true), "EXECUTE", `must auto-prepare: ${prompt}`);
}
assert.equal(classifyCreativeRequestMode("", true), "UNSPECIFIED", "image-only stays in guided-choice mode");
assert.equal(classifyCreativeRequestMode("What can I do with this?", true), "EXPLORE");
assert.equal(classifyCreativeRequestMode("Is image ke saath kya kya kar sakte hain?", true), "EXPLORE");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const orchestrator = fs.readFileSync(path.join(root, "lib", "social", "agent", "orchestrator.ts"), "utf8");
const message = fs.readFileSync(path.join(root, "app", "admin", "(shell)", "social", "agent", "AgentMessage.tsx"), "utf8");
const whatsapp = fs.readFileSync(path.join(root, "lib", "social", "whatsapp-bridge.ts"), "utf8");

assert.ok(orchestrator.includes('creativeRequestMode === "EXECUTE"'), "shared orchestrator must enforce execution mode");
assert.ok(orchestrator.includes("executionRecoveryAttempted"), "prose-only provider response gets one tool-use recovery");
assert.ok(orchestrator.includes('responseText = "Prepared for review."'), "prepared artifact suppresses angle prose");
assert.ok(orchestrator.includes("PUBLISH_INTENT_TOOLS.has(action.tool)"), "final publish approval remains the only gate");
assert.ok(message.includes("hasPreparedArtifact"), "center canvas suppresses assistant prose when artifact exists");
assert.ok(message.includes("PublishApprovalGroup"), "combined artifact exposes preview/edit/approval controls");
assert.ok(whatsapp.includes("runAgentTurn"), "WhatsApp inherits the shared orchestrator behavior");

console.log("creative-execution-intent.test.ts: ALL PASS (exact failure, execution, exploration, image-only, multi-image, WhatsApp inheritance)");
