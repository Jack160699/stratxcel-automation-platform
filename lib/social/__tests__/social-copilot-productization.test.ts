// Run with: node --experimental-strip-types lib/social/__tests__/social-copilot-productization.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
  reviewFamilyId,
  selectActionsToSupersede,
} from "../agent/action-supersession.ts";
import {
  containsNormalizedPhrase,
  evaluateBrandTrustHardGate,
  normalizePhraseForMatch,
  canShowApprovalControl,
} from "../agent/trust-hard-gate.ts";
import { aggregateVariantTrust } from "../agent/review-trust.ts";
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
  DEFAULT_WEEKLY_SLOT_POLICY,
} from "../workforce/week-planner.ts";
import { isNaturalPublishPhrase } from "../workforce/authorization.ts";
import { SocialScheduleError } from "../workforce/schedule.ts";
import { loadCurrentReviewArtifact } from "../agent/review-session.ts";
import { editProposedPublishAction } from "../agent/action-preview.ts";
import { createContentVariant } from "../repositories/content.ts";
import { claimAgentAction, getAction } from "../repositories/agent.ts";
import { handleLocalArtifactDisplayTurn } from "../agent/local-artifact-turn.ts";
import { MemorySocialDb, seedBrand } from "./fakes/memory-social-db.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function seedReview(db: MemorySocialDb, opts: {
  sessionId: string;
  reviewId: string;
  revision: number;
  captions: Array<{ platform: string; caption: string }>;
  status?: string;
}) {
  const masterId = randomUUID();
  const actionIds: string[] = [];
  const variantIds: string[] = [];
  for (const item of opts.captions) {
    const variantId = randomUUID();
    variantIds.push(variantId);
    db.insert("content_variants", {
      id: variantId,
      master_id: masterId,
      platform: item.platform,
      format: "post",
      objective: "ENGAGEMENT",
      caption: item.caption,
      hashtags: [],
      media_urls: [],
      creative_spec: { generationKey: `${opts.reviewId}:${item.platform}:v${opts.revision}` },
      status: "READY",
      created_at: new Date().toISOString(),
    });
    const actionId = randomUUID();
    actionIds.push(actionId);
    db.insert("social_agent_actions", {
      id: actionId,
      session_id: opts.sessionId,
      tool_name: "schedule_post",
      input: {
        variantId,
        platform: item.platform,
        reviewId: opts.reviewId,
        revision: opts.revision,
        contentMasterId: masterId,
        scheduledAt: "2026-08-14T05:00:00.000Z",
        timeZone: "Asia/Kolkata",
        wallClockLabel: "2026-08-14T10:30",
      },
      status: opts.status ?? "PROPOSED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return { masterId, actionIds, variantIds };
}

async function run() {
  // --- Intents ---
  assert.equal(classifySocialCopilotIntent("Plan this week"), "PREPARE_WEEK_PLAN");
  assert.equal(classifySocialCopilotIntent("show me the variants"), "SHOW_VARIANTS");
  assert.equal(classifySocialCopilotIntent("yes"), "NATURAL_AFFIRMATION");
  assert.equal(classifySocialCopilotIntent("push it"), "NATURAL_AFFIRMATION");

  // --- Week planner mid-week ---
  const nowThu = "2026-08-13T04:30:00.000Z";
  const week = resolveThisWeekRange("Asia/Kolkata", nowThu);
  assert.equal(week.start.day, 13);
  assert.equal(week.end.day, 16);
  const slots = planWeekSlots({ timeZone: "Asia/Kolkata", nowIso: nowThu, itemCount: 3 });
  assert.equal(slots.length, 3);
  for (const slot of slots) {
    assert.ok(Date.parse(slot.scheduledAtIso) > Date.parse(nowThu));
    assert.ok(slot.localDay >= 13 && slot.localDay <= 16);
  }

  // --- Weekend policy (Saturday start) ---
  // 2026-08-15 is Saturday. Default policy must use weekendHours (11), not weekday identity-compare bug.
  const nowSat = "2026-08-15T04:30:00.000Z"; // Sat 10:00 IST
  const satSlots = planWeekSlots({ timeZone: "Asia/Kolkata", nowIso: nowSat, itemCount: 2 });
  assert.ok(satSlots.length >= 1);
  assert.ok(
    satSlots.some((s) => s.localDay === 15 && s.localHour === DEFAULT_WEEKLY_SLOT_POLICY.weekendHours[0]),
    "Saturday default slots must use weekendHours (11), not weekday preferredHours identity bug",
  );
  // Sunday remaining
  const nowSun = "2026-08-16T03:00:00.000Z"; // Sun 08:30 IST
  const sunSlots = planWeekSlots({ timeZone: "Asia/Kolkata", nowIso: nowSun, itemCount: 1 });
  assert.equal(sunSlots.length, 1);
  assert.equal(sunSlots[0].localDay, 16);
  assert.equal(sunSlots[0].localHour, DEFAULT_WEEKLY_SLOT_POLICY.weekendHours[0]);

  assert.throws(
    () => planWeekSlots({ timeZone: "Asia/Kolkata", nowIso: "2026-08-16T18:00:00.000Z", itemCount: 20 }),
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

  // --- Idempotency helpers ---
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
  assert.equal(
    findExistingVariantByGenerationKey(
      [{ id: "var-1", generationKey: key, platform: "instagram", masterId: "master-1", revision: 1 }],
      key,
    )?.id,
    "var-1",
  );

  // --- Supersession scoped ---
  const familyA = "review_session_A";
  const familyB = "review_session_B";
  const mixed = [
    { id: "a1", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: familyA, revision: 1 } },
    { id: "a2", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: familyA, revision: 1 } },
    { id: "a3", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: familyA, revision: 1 } },
    { id: "b1", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: familyB, revision: 1 } },
    { id: "b2", status: "PROPOSED", tool_name: "schedule_post", input: { reviewId: familyB, revision: 1 } },
  ];
  const toSuper = selectActionsToSupersede(mixed, { reviewId: familyA, revision: 2 });
  assert.deepEqual(toSuper.sort(), ["a1", "a2", "a3"]);
  const after = applySupersession(mixed, { reviewId: familyA, revision: 2 });
  assert.equal(after.filter((a) => a.status === "SUPERSEDED").length, 3);
  assert.equal(after.filter((a) => a.input.reviewId === familyB && a.status === "PROPOSED").length, 2);
  assert.equal(countActiveProposed(after, familyB), 2);
  assert.equal(isClaimableProposedStatus("SUPERSEDED"), false);

  // --- Trust aggregate (no fabricated PASS) ---
  const blockedAgg = aggregateVariantTrust({
    variants: [{ variantId: "v1", caption: "This game changing system helps teams." }],
    blockedPhrases: ["game-changing"],
  });
  assert.equal(blockedAgg.trustStatus, "BLOCK");
  assert.equal(blockedAgg.displayStatus, "NEEDS_REVIEW");
  assert.equal(blockedAgg.approvalAllowed, false);

  const unsupportedAgg = aggregateVariantTrust({
    variants: [{ variantId: "v2", caption: "Enjoy zero manual errors every day." }],
  });
  assert.equal(unsupportedAgg.approvalAllowed, false);
  assert.ok(unsupportedAgg.trustStatus === "REVISE" || unsupportedAgg.trustStatus === "BLOCK");

  assert.equal(normalizePhraseForMatch("game-changing"), "game changing");
  assert.equal(containsNormalizedPhrase("This game changing system", "game-changing"), true);
  assert.equal(canShowApprovalControl("BLOCK"), false);

  // --- Media identity ---
  const att = "11111111-1111-4111-8111-111111111111";
  const media = "22222222-2222-4222-8222-222222222222";
  assert.equal(assertAttachmentSlot({ attachmentId: att }), att);
  assert.throws(() => assertAttachmentSlot({ mediaAssetId: media }), MediaIdentityError);
  assert.throws(() => assertMediaAssetSlot({ attachmentId: att }), MediaIdentityError);

  // --- Source wiring ---
  const orch = fs.readFileSync(path.join(root, "lib", "social", "agent", "orchestrator.ts"), "utf8");
  assert.ok(orch.includes("loadImageAttachmentsForModel"));
  assert.ok(!orch.includes("legacyProposed"), "must not supersede all session PROPOSED");
  assert.ok(orch.includes("computeSupersedeIdsForNewRevision"));
  const ui = fs.readFileSync(path.join(root, "app", "admin", "(shell)", "social", "agent", "PublishApprovalCard.tsx"), "utf8");
  assert.ok(ui.includes("Needs revision"));
  assert.ok(ui.includes("approvalAllowed"));

  // ========== INTEGRATION: TRUST on loadCurrentReviewArtifact ==========
  {
    const db = new MemorySocialDb();
    seedBrand(db, ["game-changing"], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "WAITING_FOR_CHOICE" });
    const reviewId = reviewFamilyId(sessionId, "master-blocked");
    seedReview(db, {
      sessionId,
      reviewId,
      revision: 1,
      captions: [{ platform: "linkedin", caption: "Our game-changing platform ships today." }],
    });
    const ctx = db.asOwnerContext();
    const artifact = await loadCurrentReviewArtifact(ctx, sessionId, { reviewId });
    assert.ok(artifact);
    assert.equal(artifact!.trustStatus, "BLOCK");
    assert.equal(artifact!.displayStatus, "NEEDS_REVIEW");
    assert.equal(artifact!.approvalAllowed, false);
  }

  {
    const db = new MemorySocialDb();
    seedBrand(db, [], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "WAITING_FOR_CHOICE" });
    const reviewId = reviewFamilyId(sessionId, "master-unsupported");
    seedReview(db, {
      sessionId,
      reviewId,
      revision: 1,
      captions: [{ platform: "instagram", caption: "Get zero manual errors with Stratxcel." }],
    });
    const artifact = await loadCurrentReviewArtifact(db.asOwnerContext(), sessionId, { reviewId });
    assert.ok(artifact);
    assert.equal(artifact!.approvalAllowed, false);
    assert.ok(artifact!.trustStatus === "REVISE" || artifact!.trustStatus === "BLOCK");
  }

  // ========== INTEGRATION: SHOW_VARIANTS / YES via local artifact turn ==========
  {
    const db = new MemorySocialDb();
    seedBrand(db, [], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "READY" });
    const reviewId = reviewFamilyId(sessionId, "master-show");
    const seeded = seedReview(db, {
      sessionId,
      reviewId,
      revision: 1,
      captions: [
        { platform: "instagram", caption: "Clean product launch post." },
        { platform: "linkedin", caption: "Operator update for founders." },
      ],
    });
    const beforeVariants = db.tables.content_variants.length;
    const runId = randomUUID();
    db.insert("social_agent_runs", { id: runId, session_id: sessionId, status: "RUNNING" });

    const result = await handleLocalArtifactDisplayTurn(
      db.asOwnerContext(),
      sessionId,
      runId,
      "show me the variants",
      "SHOW_VARIANTS",
    );
    assert.equal(result.handled, true);
    assert.equal(result.aiCalls, 0);
    assert.equal(db.tables.content_variants.length, beforeVariants, "show variants must not create variants");
    const agentMsgs = db.tables.social_agent_messages.filter((m) => m.role === "AGENT");
    assert.ok(agentMsgs.length >= 1);
    const parts = (agentMsgs.at(-1)?.parts ?? []) as Array<Record<string, unknown>>;
    assert.ok(parts.some((p) => p.type === "social_copilot_review"), "structured review required");
    assert.equal(seeded.variantIds.length, 2);
    assert.ok(result.reviewArtifact);
  }

  {
    const db = new MemorySocialDb();
    seedBrand(db, [], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "WAITING_FOR_CHOICE" });
    const reviewId = reviewFamilyId(sessionId, "master-yes");
    seedReview(db, {
      sessionId,
      reviewId,
      revision: 1,
      captions: [{ platform: "threads", caption: "Short honest update." }],
    });
    const beforeVariants = db.tables.content_variants.length;
    const beforeProposed = db.tables.social_agent_actions.filter((a) => a.status === "PROPOSED").length;
    const runId = randomUUID();
    db.insert("social_agent_runs", { id: runId, session_id: sessionId, status: "RUNNING" });

    const result = await handleLocalArtifactDisplayTurn(
      db.asOwnerContext(),
      sessionId,
      runId,
      "push it",
      "NATURAL_AFFIRMATION",
    );
    assert.equal(result.handled, true);
    assert.equal(result.aiCalls, 0);
    assert.equal(db.tables.content_variants.length, beforeVariants);
    assert.equal(db.tables.social_agent_actions.filter((a) => a.status === "PROPOSED").length, beforeProposed);
    assert.equal(db.tables.social_agent_actions.filter((a) => a.status === "EXECUTING" || a.status === "SUCCEEDED").length, 0);
    assert.ok(result.reviewArtifact);
    assert.ok(isNaturalPublishPhrase("push it"));
  }

  // ========== INTEGRATION: EDIT creates new revision ==========
  {
    const db = new MemorySocialDb();
    seedBrand(db, [], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "WAITING_FOR_CHOICE" });
    const reviewId = reviewFamilyId(sessionId, "master-edit");
    const seeded = seedReview(db, {
      sessionId,
      reviewId,
      revision: 1,
      captions: [{ platform: "linkedin", caption: "Original LinkedIn caption that is quite long for testing." }],
    });
    const oldActionId = seeded.actionIds[0];
    const oldVariantId = seeded.variantIds[0];
    const oldCaption = String(db.tables.content_variants.find((v) => v.id === oldVariantId)?.caption);

    const preview = await editProposedPublishAction(db.asOwnerContext(), oldActionId, {
      caption: "Shorter LinkedIn caption.",
    });
    assert.notEqual(preview.actionId, oldActionId, "must return new action identity");
    assert.equal(preview.revision, 2);
    assert.equal(preview.reviewId, reviewId);
    assert.ok(preview.artifactVersion === "v2");

    const oldAction = await getAction(db.asOwnerContext(), oldActionId);
    assert.equal(oldAction?.status, "SUPERSEDED");
    const oldVariant = db.tables.content_variants.find((v) => v.id === oldVariantId);
    assert.equal(oldVariant?.caption, oldCaption, "revision 1 content immutable");

    const newVariant = db.tables.content_variants.find((v) => v.id === preview.actionId ? false : true);
    // Find new variant via new action
    const newAction = await getAction(db.asOwnerContext(), preview.actionId);
    assert.equal(newAction?.status, "PROPOSED");
    assert.equal(newAction?.input?.revision, 2);
    assert.notEqual(newAction?.input?.variantId, oldVariantId);

    const claimed = await claimAgentAction(db.asOwnerContext(), oldActionId, "EXECUTING");
    assert.equal(claimed, false, "superseded revision 1 cannot execute");
  }

  // ========== INTEGRATION: scoped supersession across two reviews ==========
  {
    const db = new MemorySocialDb();
    seedBrand(db, [], []);
    const sessionId = randomUUID();
    db.insert("social_agent_sessions", { id: sessionId, owner_id: "owner-1", status: "WAITING_FOR_CHOICE" });
    const reviewA = reviewFamilyId(sessionId, "master-A");
    const reviewB = reviewFamilyId(sessionId, "master-B");
    const seededA = seedReview(db, {
      sessionId,
      reviewId: reviewA,
      revision: 1,
      captions: [
        { platform: "instagram", caption: "A1 clean" },
        { platform: "linkedin", caption: "A2 clean" },
        { platform: "threads", caption: "A3 clean" },
      ],
    });
    seedReview(db, {
      sessionId,
      reviewId: reviewB,
      revision: 1,
      captions: [
        { platform: "facebook", caption: "B1 clean" },
        { platform: "youtube", caption: "B2 clean" },
      ],
    });

    await editProposedPublishAction(db.asOwnerContext(), seededA.actionIds[0], {
      caption: "A1 revised shorter",
    });

    const aSuperseded = db.tables.social_agent_actions.filter(
      (a) => a.input && (a.input as Row).reviewId === reviewA && a.status === "SUPERSEDED",
    );
    const aProposed = db.tables.social_agent_actions.filter(
      (a) => a.input && (a.input as Row).reviewId === reviewA && a.status === "PROPOSED",
    );
    const bProposed = db.tables.social_agent_actions.filter(
      (a) => a.input && (a.input as Row).reviewId === reviewB && a.status === "PROPOSED",
    );
    assert.ok(aSuperseded.length >= 1);
    assert.ok(aProposed.length >= 1);
    assert.equal(bProposed.length, 2, "unrelated review B must remain PROPOSED");
  }

  // ========== INTEGRATION: concurrent generationKey idempotency ==========
  {
    const db = new MemorySocialDb();
    const ctx = db.asOwnerContext();
    const masterId = randomUUID();
    const generationKey = buildVariantGenerationKey({
      tenantId: "owner-1",
      missionId: "m",
      sessionId: "s",
      contentSlot: "slot",
      masterId,
      platform: "instagram",
      format: "post",
      briefVersion: "v1",
      revision: 1,
    });
    const input = {
      masterId,
      platform: "instagram",
      format: "post",
      objective: "ENGAGEMENT",
      caption: "Canonical caption",
      hashtags: [] as string[],
      mediaUrls: [] as string[],
      generationKey,
    };
    const [first, second] = await Promise.all([
      createContentVariant(ctx, input),
      createContentVariant(ctx, input).catch(async () => createContentVariant(ctx, input)),
    ]);
    assert.equal(first.id, second.id, "concurrent prepares must converge on one variant");
    assert.equal(db.tables.content_variants.filter((v) => v.master_id === masterId).length, 1);
  }

  // --- Image capability ---
  resetImageProvider();
  const unconfigured = await requestGenerateImage({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    briefText: "Brand product hero",
  });
  // Key presence alone is not OPERATIONAL — without storage expect NOT_CONFIGURED or WAITING_CONFIGURATION.
  assert.ok(
    unconfigured.outcome === "NOT_CONFIGURED" || unconfigured.outcome === "WAITING_CONFIGURATION",
    `expected NOT_CONFIGURED/WAITING_CONFIGURATION, got ${unconfigured.outcome}`,
  );
  assert.equal(unconfigured.candidates.length, 0);
  const withTest = await requestGenerateImage({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    briefText: "Brand product hero",
    testProvider: new MockImageProvider(),
    candidateCount: 2,
  });
  assert.equal(withTest.outcome, "REVISION_REQUIRED");
  assert.equal(withTest.selectedCandidateId, null);
  resetImageProvider();
  assert.equal(resolveImageGenerationRuntimeStatus({}), "NOT_CONFIGURED");
  assert.equal(resolveImageGenerationRuntimeStatus({ providerConfigured: true }), "WAITING_CONFIGURATION");

  // Shadow claims
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
  assert.ok(liveClaim.decision !== "PASS");

  // Migrations
  assert.ok(
    fs.existsSync(path.join(root, "supabase", "migrations", "20260812110000_reconcile_social_agent_action_claim.sql")),
  );
  assert.ok(
    fs.existsSync(path.join(root, "supabase", "migrations", "20260812120000_content_variant_generation_key_unique.sql")),
  );
  const uniqueMig = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260812120000_content_variant_generation_key_unique.sql"),
    "utf8",
  );
  assert.ok(uniqueMig.includes("content_variants_generation_key_uidx"));

  // Narrative truth
  const artifact = buildSocialCopilotReviewArtifact({
    tenantId: "t1",
    missionId: "m1",
    sessionId: "s1",
    reviewId: "review_s1_m",
    revision: 1,
    trustStatus: "PASS",
    approvalAllowed: true,
    displayStatus: "READY_FOR_APPROVAL",
    variants: [
      { variantId: "v1", platform: "instagram", format: "post", caption: "IG", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[0].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[0].wallClockLabel },
      { variantId: "v2", platform: "threads", format: "post", caption: "TH", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[1].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[1].wallClockLabel },
      { variantId: "v3", platform: "linkedin", format: "post", caption: "LI", hashtags: [], mediaAssetIds: [], scheduledAtIso: slots[2].scheduledAtIso, timeZone: "Asia/Kolkata", wallClockLabel: slots[2].wallClockLabel },
    ],
  });
  assert.deepEqual(platformsFromReview(artifact).sort(), ["instagram", "linkedin", "threads"]);
  assert.equal(narrativeFromReview(artifact), "Prepared for review.");
  assert.equal(reviewArtifactMessagePart(artifact).approvalAllowed, true);

  console.log("social-copilot-productization: ok");
}

type Row = Record<string, unknown>;

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
