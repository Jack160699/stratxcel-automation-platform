// Tests the publish-outcome classification used to stop the Copilot from
// ever reporting "Done."/"Posted."/"Published." for a mission that did not
// prove a real publication (Sections 10-13 of the integrity brief), plus
// source-text checks that the orchestrator/tools/automation wiring that
// depends on it is actually in place — same technique as
// copilot-telemetry.test.ts and media-ingestion.test.ts, since this
// module's graph (worker.ts -> providers -> …) cannot be resolved
// standalone under `node --experimental-strip-types`.
// Run with: node --experimental-strip-types lib/social/__tests__/publish-outcome.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISH_INTENT_TOOLS, isProvenLivePublish, describePublishAttempt } from "../agent/publish-outcome-classify.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  assert.deepEqual(
    [...PUBLISH_INTENT_TOOLS].sort(),
    ["execute_private_youtube_verification", "execute_youtube_verification", "schedule_post"].sort()
  );

  // isProvenLivePublish: only a real, live (non-shadow) PUBLISHED result counts.
  assert.equal(isProvenLivePublish({ jobStatus: "PUBLISHED", mode: "live" }), true);
  assert.equal(isProvenLivePublish({ jobStatus: "PUBLISHED", mode: "verification_live" }), true);
  assert.equal(isProvenLivePublish({ jobStatus: "PUBLISHED", mode: "shadow" }), false, "Shadow Mode is never a proven live publish");
  assert.equal(isProvenLivePublish({ jobStatus: "SCHEDULED", mode: "live" }), false, "still queued is not published");
  assert.equal(isProvenLivePublish({ jobStatus: "FAILED" }), false);
  assert.equal(isProvenLivePublish({ status: "PUBLISHED", externalPostId: "yt-123" }), true, "YouTube verification shape");
  assert.equal(isProvenLivePublish({ status: "FAILED" }), false);
  assert.equal(isProvenLivePublish(null), false);
  assert.equal(isProvenLivePublish("PUBLISHED"), false, "a bare string is never proof");

  // describePublishAttempt: the model must quote the real outcomeNote, not invent one.
  const shadowResult = describePublishAttempt("schedule_post", {
    jobStatus: "PUBLISHED",
    mode: "shadow",
    outcomeNote: "Draft prepared successfully, but Social Autopilot is in Shadow Mode, so nothing was published externally — there is no live post or permalink.",
  });
  assert.equal(shadowResult.succeeded, false);
  assert.match(shadowResult.note, /Shadow Mode/);

  const liveResult = describePublishAttempt("schedule_post", {
    jobStatus: "PUBLISHED",
    mode: "live",
    permalink: "https://www.threads.net/@stratxcel/post/xyz",
    outcomeNote: "Published successfully. Live permalink: https://www.threads.net/@stratxcel/post/xyz",
  });
  assert.equal(liveResult.succeeded, true);
  assert.match(liveResult.note, /https:\/\/www\.threads\.net/);

  const queuedResult = describePublishAttempt("schedule_post", {
    jobStatus: "SCHEDULED",
    outcomeNote: "Queued for publishing at the requested future time. It is not live yet.",
  });
  assert.equal(queuedResult.succeeded, false);
  assert.match(queuedResult.note, /not live yet/);

  const youtubeVerified = describePublishAttempt("execute_youtube_verification", {
    status: "PUBLISHED",
    externalPostId: "yt-abc",
    permalink: "https://youtube.com/watch?v=abc",
  });
  assert.equal(youtubeVerified.succeeded, true);
  assert.match(youtubeVerified.note, /youtube\.com/);

  const unknownFailure = describePublishAttempt("schedule_post", null);
  assert.equal(unknownFailure.succeeded, false);
  assert.match(unknownFailure.note, /did not confirm a live publication/);

  // --- Source-text checks: the integrity fixes are actually wired in. ---
  const tools = read("lib", "social", "agent", "tools.ts");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  const automation = read("lib", "social", "repositories", "automation.ts");
  const content = read("lib", "social", "repositories", "content.ts");

  assert.ok(tools.includes("platformsMatch(account.platform, variant.platform)"), "schedule_post must compare platforms canonically, not with !==");
  assert.ok(!tools.includes("account.platform !== variant.platform"), "the literal casing-sensitive comparison must be gone");
  assert.ok(tools.includes("runPublishNow(service, jobId, scheduledAt, ctx.ownerId)"), "schedule_post must return the real terminal state, not just a job id");
  assert.ok(tools.includes('requireUuid(args.accountId, "accountId")') && tools.includes('requireUuid(args.variantId, "variantId")'));
  assert.ok(tools.includes('optionalUuid(args.campaignId, "campaignId")'), "campaignId must never be a fabricated name");
  assert.ok(content.includes("requirePlatform(input.platform"), "content_variants.platform must be canonicalized at write time too");

  assert.ok(orchestrator.includes("attachmentContextSuffix"), "the model must receive real attachment IDs in its context");
  assert.ok(orchestrator.includes("Trusted attachment context"));
  assert.ok(
    orchestrator.includes("BARE_SUCCESS_CLAIM") && orchestrator.includes("lastPublishOutcome.note"),
    "a bare Done./Posted./Published. reply after a failed publish attempt must be replaced with the real outcome"
  );
  assert.ok(orchestrator.includes("missionOutcome"), "the terminal event must reflect whether the mission actually succeeded");
  {
    // The needsApproval branch must wrap validateBrandEntities in its own
    // try/catch so an invalid Brand Brain value (e.g. an invented content
    // pillar) becomes a normal tool error, not an uncaught throw that
    // crashes the whole run — assert the try/catch physically surrounds it.
    const approvalBranchStart = orchestrator.indexOf("if (needsApproval) {");
    const nextBranch = orchestrator.indexOf("const toolLabel = labelForTool(tool.schema.name);");
    assert.ok(approvalBranchStart > -1 && nextBranch > approvalBranchStart, "could not locate the needsApproval branch");
    const approvalBranch = orchestrator.slice(approvalBranchStart, nextBranch);
    const tryIndex = approvalBranch.indexOf("try {");
    const validateIndex = approvalBranch.indexOf("validateBrandEntities(ctx, tool.schema.name, stripInternalInput(call.arguments))");
    const catchIndex = approvalBranch.indexOf("} catch (err) {");
    assert.ok(
      tryIndex > -1 && tryIndex < validateIndex && validateIndex < catchIndex,
      "validateBrandEntities in the approval branch must be inside a try/catch, not left to crash the run"
    );
  }

  assert.ok(
    automation.includes('PUBLISH_ACTION_TOOLS') && automation.includes('"schedule_post"') && automation.includes('require_approval_for.includes("publish_post")'),
    "the Automations UI's publish_post approval toggle must actually gate the real publish tools"
  );

  console.log("publish-outcome.test.ts: ALL PASS (live-publish proof, Shadow Mode honesty, queued/failed wording, integrity wiring present)");
}

run();
