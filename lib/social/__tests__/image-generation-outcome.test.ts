// Tests the image-generation outcome classification that closes a live,
// previously-unfixed instance of the exact verification-integrity bug class
// Updates 10/13 fixed elsewhere (see docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md):
// generate_image (executeGenerateImageTool) can return a real, non-throwing
// outcome: FAILED/REVISION_REQUIRED/NOT_CONFIGURED/WAITING_CONFIGURATION/PENDING,
// and Social Autopilot's OWN, separate agent loop (lib/social/agent/orchestrator.ts
// -- distinct from packages/agent-core's canonical runAgentTurn) never checked
// it, unlike this same module's PUBLISH_INTENT_TOOLS handling.
// Run with: node --experimental-strip-types lib/social/__tests__/image-generation-outcome.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeImageGenerationOutcome } from "../agent/publish-outcome-classify.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  assert.match(describeImageGenerationOutcome("FAILED"), /did not succeed/);
  assert.match(describeImageGenerationOutcome("FAILED", "provider_rate_limited"), /provider_rate_limited/);
  assert.match(describeImageGenerationOutcome("REVISION_REQUIRED"), /need your selection/);
  assert.match(describeImageGenerationOutcome("NOT_CONFIGURED"), /isn't fully set up/);
  assert.match(describeImageGenerationOutcome("WAITING_CONFIGURATION", "no_provider_key"), /no_provider_key/);
  assert.match(describeImageGenerationOutcome("PENDING"), /still pending/);
  // Every non-OK note is explicit that nothing was actually created --
  // never something a model could read as a soft success.
  for (const outcome of ["FAILED", "NOT_CONFIGURED", "WAITING_CONFIGURATION"]) {
    assert.match(describeImageGenerationOutcome(outcome), /no image was created/);
  }

  // --- Source-text checks: the integrity fix is actually wired into
  // Social Autopilot's own agent loop, not just defined and unused. ---
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  assert.match(orchestrator, /describeImageGenerationOutcome/, "orchestrator.ts must import and use the classifier");
  assert.match(orchestrator, /lastImageOutcome/, "a non-OK generate_image outcome must be tracked across the turn");
  assert.match(orchestrator, /genOutput\.outcome !== "OK"/, "only a genuinely non-OK outcome should trigger the override");
  // The failure note must actually reach the persisted chat message (append,
  // not get computed and then discarded) -- and the session/mission status
  // must reflect it too, the same way lastPublishOutcome's failure does.
  assert.match(orchestrator, /lastImageOutcome\.note/, "the real note must reach the response text");
  assert.match(orchestrator, /imageOutcomeFailed/, "terminal session/mission status must account for a failed image generation");

  console.log("image-generation-outcome.test.ts (@stratxcel/social): ALL PASS");
}

run();
