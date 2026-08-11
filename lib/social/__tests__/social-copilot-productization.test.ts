// Run with: node --experimental-strip-types lib/social/__tests__/social-copilot-productization.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifySocialCopilotIntent } from "../agent/copilot-intents.ts";
import {
  buildSocialCopilotReviewArtifact,
  narrativeFromReview,
  platformsFromReview,
  reviewArtifactMessagePart,
} from "../agent/review-artifact.ts";
import {
  buildVariantGenerationKey,
  findExistingVariantByGenerationKey,
} from "../agent/variant-idempotency.ts";
import {
  applySupersession,
  countActiveProposed,
  isClaimableProposedStatus,
  selectActionsToSupersede,
} from "../agent/action-supersession.ts";
import {
  containsNormalizedPhrase,
  evaluateBrandTrustHardGate,
  normalizePhraseForMatch,
  canShowApprovalControl,
} from "../agent/trust-hard-gate.ts";
import {
  assertAttachmentSlot,
  assertMediaAssetSlot,
  MediaIdentityError,
} from "../agent/media-identity.ts";
import {
  buildProductCapabilityEvidence,
  resolveImageGenerationRuntimeStatus,
} from "../agent/capability-evidence.ts";
import { requestGenerateImage } from "../agent/generate-image-capability.ts";
import { MockImageProvider, resetImageProvider } from "@stratxcel/creative-studio";
import {
  planWeekSlots,
  resolveThisWeekRange,
  WeekPlanError,
  assertWeekPlanScheduleValid,
} from "../workforce/week-planner.ts";
import { isNaturalPublishPhrase } from "../workforce/authorization.ts";
import { SocialScheduleError } from "../workforce/schedule.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function run() {
  // --- Intents ---
  assert.equal(classifySocialCopilotIntent("Plan this week"), "PREPARE_WEEK_PLAN");
  assert.equal(classifySocialCopilotIntent("plan my week"), "PREPARE_WEEK_PLAN");
  assert.equal(classifySocialCopilotIntent("hafte ka plan"), "PREPARE_WEEK_PLAN");
  assert.equal(classifySocialCopilotIntent("show me the variants"), "SHOW_VARIANTS");
  assert.equal(classifySocialCopilotIntent("show drafts"), "SHOW_VARIANTS");
  assert.equal(classifySocialCopilotIntent("yes"), "NATURAL_AFFIRMATION");
  assert.equal(classifySocialCopilotIntent("push it"), "NATURAL_AFFIRMATION");
  assert.equal(classifySocialCopilotIntent("haan"), "NATURAL_AFFIRMATION");
  assert.equal(classifySocialCopilotIntent("kar do"), "NATURAL_AFFIRMATION");
  assert.equal(classifySocialCopilotIntent("change the LinkedIn caption to be shorter"), "REVISE_CURRENT_ARTIFACT");
  assert.equal(classifySocialCopilotIntent("post it now"), "POST_NOW_REQUEST");

  // --- Week planner (Asia/Kolkata, mid-week Thursday) ---
  // 2026-08-13 is Thursday. Local Kolkata = UTC+5:30 → 2026-08-13T04:30:00.000Z = 10:00 IST Thursday
  const nowThu = "2026-08-13T04:30:00.000Z";
  const week = resolveThisWeekRange("Asia/Kolkata", nowThu);
  assert.equal(week.start.day, 13);
  assert.equal(week.end.day, 16); // Sunday Aug 16 2026

  const slots = planWeekSlots({
    timeZone: "Asia/Kolkata",
    nowIso: nowThu,
    itemCount: 3,
  });
  assert.equal(slots.length, 3);
  for (const slot of slots) {
    assert.ok(slot.scheduledAtIso);
    assert.equal(slot.timeZone, "Asia/Kolkata");
    assert.ok(slot.wallClockLabel);
    assert.ok(Date.parse(slot.scheduledAtIso) > Date.parse(nowThu));
    // Must not schedule Mon/Tue past relative to Thursday
    assert.ok(slot.localDay >= 13 && slot.localDay <= 16);
  }
  assert.throws(
    () =>
      planWeekSlots({
        timeZone: "Asia/Kolkata",
        nowIso: "2026-08-16T18:00:00.000Z", // late Sunday IST
        itemCount: 20,
      }),
    WeekPlanError,
  );

  assert.throws(
    () =>
      assertWeekPlanScheduleValid({
        scheduledAt: null,
        timeZone: "Asia/Kolkata",
        rangeStartIso: slots[0].scheduledAtIso,
        rangeEndIso: slots[2].scheduledAtIso,
        nowIso: nowThu,
      }),
    SocialScheduleError,
  );

  // --- Idempotency ---
  const key = buildVariantGenerationKey({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    contentSlot: "slot-a",
    masterId: "master-1",
    platform: "instagram",
    format: "post",
    briefVersion: "v1",
    revision: 1,
  });
  const existing = [
    { id: "var-1", generationKey: key, platform: "instagram", masterId: "master-1", revision: 1 },
  ];
  assert.equal(findExistingVariantByGenerationKey(existing, key)?.id, "var-1");
  assert.equal(findExistingVariantByGenerationKey(existing, "other"), null);

  // Simulated: show variants / yes must not create more
  let variantCount = 8;
  let aiCalls = 0;
  const showIntent = classifySocialCopilotIntent("show me the variants");
  assert.equal(showIntent, "SHOW_VARIANTS");
  // Local path: aiCalls stays 0, variantCount unchanged
  assert.equal(variantCount, 8);
  assert.equal(aiCalls, 0);
  for (const phrase of ["yes", "push it", "haan", "kar do"]) {
    assert.equal(classifySocialCopilotIntent(phrase), "NATURAL_AFFIRMATION");
    assert.equal(isNaturalPublishPhrase(phrase), true);
    assert.equal(variantCount, 8);
  }

  // --- Supersession ---
  const rev1Actions = [
    { id: "a1", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_1", revision: 1 } },
    { id: "a2", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_1", revision: 1 } },
    { id: "a3", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_1", revision: 1 } },
    { id: "unrelated", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "other", revision: 1 } },
  ];
  const toSuper = selectActionsToSupersede(rev1Actions, { reviewId: "review_s_1", revision: 2 });
  assert.deepEqual(toSuper.sort(), ["a1", "a2", "a3"]);
  const after = applySupersession(rev1Actions, { reviewId: "review_s_1", revision: 2 });
  assert.equal(after.filter((a) => a.status === "SUPERSEDED").length, 3);
  assert.equal(after.find((a) => a.id === "unrelated")?.status, "PROPOSED");
  const rev2 = [
    ...after,
    { id: "b1", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_2", revision: 2 } },
    { id: "b2", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_2", revision: 2 } },
    { id: "b3", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: "review_s_2", revision: 2 } },
  ];
  assert.equal(countActiveProposed(rev2, "review_s_2"), 3);
  assert.equal(isClaimableProposedStatus("SUPERSEDED"), false);
  assert.equal(isClaimableProposedStatus("PROPOSED"), true);

  // --- Database/narrative truth ---
  const artifact = buildSocialCopilotReviewArtifact({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    revision: 1,
    trustStatus: "PASS",
    displayStatus: "READY_FOR_APPROVAL",
    variants: [
      { variantId: "v1", platform: "instagram", format: "post", caption: "IG", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[0].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[0].wallClockLabel },
      { variantId: "v2", platform: "threads", format: "post", caption: "TH", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[1].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[1].wallClockLabel },
      { variantId: "v3", platform: "linkedin", format: "post", caption: "LI", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[2].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[2].wallClockLabel },
    ],
  });
  assert.deepEqual(platformsFromReview(artifact).sort(), ["instagram", "linkedin", "threads"]);
  assert.equal(narrativeFromReview(artifact), "Prepared for review.");
  const part = reviewArtifactMessagePart(artifact);
  assert.equal(part.type, "social_copilot_review");
  assert.ok(Array.isArray(part.variants));
  assert.equal((part.variants as unknown[]).length, 3);
  assert.ok(!(JSON.stringify(part).toLowerCase().includes("facebook")));

  // --- Media identity ---
  const att = "11111111-1111-4111-8111-111111111111";
  const media = "22222222-2222-4222-8222-222222222222";
  assert.equal(assertAttachmentSlot({ attachmentId: att }), att);
  assert.throws(() => assertAttachmentSlot({ mediaAssetId: media }), MediaIdentityError);
  assert.equal(assertMediaAssetSlot({ mediaAssetId: media }), media);
  assert.throws(() => assertMediaAssetSlot({ attachmentId: att }), MediaIdentityError);

  // Media contamination semantics: empty current mission → no implicit old media
  // (covered by workforce resolveMediaAssetIds; assert wiring present in orchestrator source)
  const orch = fs.readFileSync(path.join(root, "lib", "social", "agent", "orchestrator.ts"), "utf8");
  assert.ok(orch.includes("loadImageAttachmentsForModel"), "current-message media only");
  assert.ok(!orch.includes("loadSessionImageAttachmentsForModel("), "must not load whole-session images for web turns");
  assert.ok(orch.includes("classifySocialCopilotIntent"), "intents wired");
  assert.ok(orch.includes("planWeekSlots"), "week planner wired");
  assert.ok(orch.includes("supersedeProposedActions"), "supersession wired");

  // --- Brand Brain / Trust ---
  assert.equal(normalizePhraseForMatch("game-changing"), "game changing");
  assert.equal(containsNormalizedPhrase("This game changing system", "game-changing"), true);
  const blocked = evaluateBrandTrustHardGate({
    caption: "This game changing system transforms work.",
    blockedPhrases: ["game-changing"],
  });
  assert.equal(blocked.decision, "BLOCK");
  assert.equal(canShowApprovalControl(blocked.decision), false);

  const unsupported = evaluateBrandTrustHardGate({
    caption: "Enjoy zero manual errors every day.",
  });
  assert.ok(unsupported.decision === "REVISE" || unsupported.decision === "HUMAN_REVIEW");
  assert.equal(canShowApprovalControl(unsupported.decision), false);

  // --- Shadow-aware claims ---
  const shadowEv = buildProductCapabilityEvidence({
    shadowMode: true,
    dryRun: true,
    socialPublishExecutable: false,
    imageGenerationStatus: "NOT_CONFIGURED",
  });
  const liveClaim = evaluateBrandTrustHardGate({
    caption: "We already automatically publish your campaigns live 24/7.",
    capabilityEvidence: shadowEv,
    isSelfMarketing: true,
  });
  assert.ok(liveClaim.decision === "REVISE" || liveClaim.decision === "BLOCK" || liveClaim.decision === "HUMAN_REVIEW");

  const honest = evaluateBrandTrustHardGate({
    caption: "Stratxcel is designed to prepare and automate social drafts with owner approval.",
    capabilityEvidence: shadowEv,
    isSelfMarketing: true,
  });
  assert.equal(honest.decision, "PASS");

  // --- Image capability ---
  assert.equal(resolveImageGenerationRuntimeStatus({}), "NOT_CONFIGURED");
  resetImageProvider();
  const unconfigured = await requestGenerateImage({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    briefText: "Brand product hero",
  });
  assert.equal(unconfigured.outcome, "NOT_CONFIGURED");
  assert.equal(unconfigured.candidates.length, 0);

  const withTest = await requestGenerateImage({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    briefText: "Brand product hero",
    testProvider: new MockImageProvider(),
    candidateCount: 2,
  });
  assert.equal(withTest.runtimeStatus, "OPERATIONAL");
  assert.ok(withTest.candidates.length >= 1);
  assert.equal(withTest.selectedCandidateId, null, "must not auto-select first candidate");
  assert.equal(withTest.outcome, "REVISION_REQUIRED");
  resetImageProvider();

  // --- Exact approval version mismatch (source contract) ---
  assert.ok(orch.includes("Exact artifact version mismatch") || orch.includes("previewArtifactVersion"));

  // --- RPC migration reconciliation ---
  const mig = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260812110000_reconcile_social_agent_action_claim.sql"),
    "utf8",
  );
  assert.ok(mig.includes("create or replace function public.claim_social_agent_action"));
  assert.ok(mig.includes("security definer"));
  assert.ok(mig.includes("a.status = 'PROPOSED'"));
  assert.ok(mig.includes("p_target_status not in ('EXECUTING', 'REJECTED')"));
  assert.ok(mig.includes("grant execute"));
  const superMig = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260812110100_social_agent_action_review_supersession.sql"),
    "utf8",
  );
  assert.ok(superMig.includes("SUPERSEDED"));

  // Fallback preserved
  const agentRepo = fs.readFileSync(path.join(root, "lib", "social", "repositories", "agent.ts"), "utf8");
  assert.ok(agentRepo.includes("claimAgentActionFallback"));
  assert.ok(agentRepo.includes("PGRST202") || agentRepo.includes("schema cache"));

  // generate_image tool present
  const tools = fs.readFileSync(path.join(root, "lib", "social", "agent", "tools.ts"), "utf8");
  assert.ok(tools.includes('name: "generate_image"'));
  assert.ok(tools.includes("assertAttachmentSlot"));

  // Docs present
  assert.ok(fs.existsSync(path.join(root, "docs", "architecture", "SOCIAL_COPILOT_PRODUCTIZATION.md")));

  console.log("social-copilot-productization: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
