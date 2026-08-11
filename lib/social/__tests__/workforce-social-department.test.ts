// Run with: node --experimental-strip-types lib/social/__tests__/workforce-social-department.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  adaptFinalCreativeForPlatform,
  assertIdenticalReleasePayload,
  assertNoStaleMediaSubstitution,
  assertTechnicalRetryPreservesArtifact,
  assertWhatsAppUsesSharedSocialState,
  buildCanonicalPublishReceipt,
  buildScheduleIntent,
  buildSocialCalendarFromSubPlan,
  buildSocialReleaseArtifact,
  classifyPublishFailure,
  createSocialInboundHandoff,
  createSocialOutboundHandoff,
  decideManualPublishGate,
  decidePackagePublishGate,
  decideUsageConsumption,
  emitAnalyticsMeasurementTarget,
  naturalLanguageAuthorizesManualPublish,
  prepareTechnicalRetry,
  queryPublicationStatusFromRecord,
  resetUsageIdempotencyLedgerForTests,
  resolveMediaAssetIds,
  socialSubPlanToPackageUnits,
  toHermesPublicationStatusPayload,
  wallPartsToScheduleIntent,
  assertAccountInTenant,
  assertAssetInTenant,
  SocialReleaseArtifactError,
  SocialScheduleError,
  SocialTenantScopeError,
  ArtifactResolutionError,
} from "../workforce/index.ts";
import type { UpstreamFinalCreative } from "../workforce/types.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function upstream(overrides: Partial<UpstreamFinalCreative> = {}): UpstreamFinalCreative {
  return {
    tenantId: "tenant-a",
    missionId: "mission-1",
    artifactId: "creative-final-1",
    caption: "Launch offer: save 20% this month. Best local service in Raipur. #growth",
    mediaAssetIds: ["media-1"],
    cta: "Book a consult",
    accessibilityText: "Team photo at storefront",
    hashtags: ["growth"],
    brandBrainVersion: 3,
    parentArtifactIds: ["content-1", "media-final-1", "qa-1"],
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    ...overrides,
  };
}

function run() {
  resetUsageIdempotencyLedgerForTests();

  // --- Upstream final → Social release artifact ---
  const schedule = buildScheduleIntent({
    kind: "AT",
    timeZone: "Asia/Kolkata",
    wallDateTimeLocal: "2026-08-15T10:30",
  });
  const release = buildSocialReleaseArtifact({
    upstream: upstream(),
    platform: "instagram",
    accountId: "acct-ig-1",
    scheduleIntent: schedule,
  });
  assert.equal(release.finalCaption.includes("20%"), true);
  assert.deepEqual([...release.mediaAssetIds], ["media-1"]);
  assert.equal(release.brandBrainVersion, 3);
  assert.ok(release.upstreamArtifactIds.includes("creative-final-1"));
  assert.ok(release.payloadFingerprint.length === 64);

  // Exact media/copy preserved through approval (preview = approval = publish)
  const approval = { ...release };
  const publish = { ...release };
  assertIdenticalReleasePayload(release, approval);
  assertIdenticalReleasePayload(approval, publish);
  assert.throws(
    () => assertIdenticalReleasePayload(release, { ...release, finalCaption: "CHANGED" }),
    SocialReleaseArtifactError,
  );

  // Platform adaptation preserves factual claims
  const adapted = adaptFinalCreativeForPlatform(upstream(), "threads");
  assert.ok(adapted.caption.toLowerCase().includes("20%"));
  assert.throws(() => adaptFinalCreativeForPlatform(upstream(), "tiktok"), /fabricated_or_unsupported_platform/);

  // No stale media substitution
  assert.throws(
    () =>
      resolveMediaAssetIds({
        tenantId: "tenant-a",
        missionId: "mission-1",
        sessionId: "session-new",
        currentSessionMedia: [],
        candidateMedia: [
          {
            mediaAssetId: "old-media",
            sessionId: "session-old",
            missionId: "mission-old",
            createdAtIso: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    ArtifactResolutionError,
  );
  const resolved = resolveMediaAssetIds({
    tenantId: "tenant-a",
    missionId: "mission-1",
    sessionId: "session-new",
    currentSessionMedia: [
      {
        mediaAssetId: "media-1",
        sessionId: "session-new",
        missionId: "mission-1",
        createdAtIso: "2026-08-11T01:00:00.000Z",
      },
    ],
  });
  assert.deepEqual(resolved, ["media-1"]);
  assert.throws(
    () =>
      assertNoStaleMediaSubstitution({
        resolvedIds: ["old-media"],
        currentSessionMediaIds: ["media-1"],
      }),
    ArtifactResolutionError,
  );

  // Cross-tenant account/asset rejected
  assert.throws(
    () =>
      assertAccountInTenant("tenant-a", {
        id: "acct-x",
        tenantId: "tenant-b",
        platform: "instagram",
        status: "CONNECTED",
      }),
    SocialTenantScopeError,
  );
  assert.throws(
    () => assertAssetInTenant("tenant-a", { id: "media-x", tenantId: "tenant-b" }),
    SocialTenantScopeError,
  );

  // Manual natural language does not publish
  for (const phrase of ["yes", "haan", "kar do", "go ahead", "push it", "post kar do"]) {
    assert.equal(naturalLanguageAuthorizesManualPublish(phrase), false);
    const denied = decideManualPublishGate({
      explicitApprovalControl: false,
      chatText: phrase,
      shadowMode: false,
      qualityStatus: "PASS",
      complianceStatus: "PASS",
    });
    assert.equal(denied.allowed, false);
  }

  // Explicit approval publishes only when Trust PASS/PASS
  const approved = decideManualPublishGate({
    explicitApprovalControl: true,
    actionId: "action-1",
    shadowMode: false,
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: true, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "1",
  });
  assert.equal(approved.allowed, true);

  // Non-PASS quality/compliance always block — even with explicit approval
  for (const status of ["REJECT", "BLOCK", "REVISE", "HUMAN_REVIEW", "not_reviewed", "missing", "unknown"]) {
    const blockedQuality = decideManualPublishGate({
      explicitApprovalControl: true,
      actionId: "action-q",
      shadowMode: false,
      qualityStatus: status,
      complianceStatus: "PASS",
    });
    assert.equal(blockedQuality.allowed, false, `quality ${status} must block`);
    assert.match(blockedQuality.reason, /quality_not_pass/);
    const blockedCompliance = decideManualPublishGate({
      explicitApprovalControl: true,
      actionId: "action-c",
      shadowMode: false,
      qualityStatus: "PASS",
      complianceStatus: status,
    });
    assert.equal(blockedCompliance.allowed, false, `compliance ${status} must block`);
    assert.match(blockedCompliance.reason, /compliance_not_pass/);
  }

  // Explicit approval cannot override Trust release block
  const approvalVsTrust = decideManualPublishGate({
    explicitApprovalControl: true,
    actionId: "action-trust",
    shadowMode: false,
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: false, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "1",
  });
  assert.equal(approvalVsTrust.allowed, false);
  assert.match(approvalVsTrust.reason, /release_not_ready/);

  // Version mismatch blocks
  const versionMismatch = decideManualPublishGate({
    explicitApprovalControl: true,
    actionId: "action-ver",
    shadowMode: false,
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: true, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "2",
  });
  assert.equal(versionMismatch.allowed, false);
  assert.match(versionMismatch.reason, /artifact_version_mismatch/);

  // Shadow blocks mutation (preparation can still have completed upstream)
  const shadowed = decideManualPublishGate({
    explicitApprovalControl: true,
    actionId: "action-2",
    shadowMode: true,
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: true, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "1",
  });
  assert.equal(shadowed.allowed, false);
  assert.equal(shadowed.shadowBlocked, true);

  // Package AUTO_PUBLISH remains scoped; manual does not inherit
  const manualInherit = decidePackagePublishGate({
    standingAuthorizationActive: true,
    authorizationId: "auth-1",
    publishingMode: "AUTO_PUBLISH",
    reviewCompleted: false,
    shadowMode: false,
    missionSource: "MANUAL",
    qualityStatus: "PASS",
    complianceStatus: "PASS",
  });
  assert.equal(manualInherit.allowed, false);
  assert.match(manualInherit.reason, /manual_mission_does_not_inherit/);

  // Package standing auth cannot override Trust block
  const packageTrustBlock = decidePackagePublishGate({
    standingAuthorizationActive: true,
    authorizationId: "auth-1",
    publishingMode: "AUTO_PUBLISH",
    reviewCompleted: false,
    shadowMode: false,
    missionSource: "PACKAGE",
    qualityStatus: "PASS",
    complianceStatus: "BLOCK",
  });
  assert.equal(packageTrustBlock.allowed, false);
  assert.match(packageTrustBlock.reason, /compliance_not_pass/);

  // Package standing auth cannot override Shadow
  const packageShadow = decidePackagePublishGate({
    standingAuthorizationActive: true,
    authorizationId: "auth-1",
    publishingMode: "AUTO_PUBLISH",
    reviewCompleted: false,
    shadowMode: true,
    missionSource: "PACKAGE",
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: true, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "1",
  });
  assert.equal(packageShadow.allowed, false);
  assert.equal(packageShadow.shadowBlocked, true);

  const packageAuto = decidePackagePublishGate({
    standingAuthorizationActive: true,
    authorizationId: "auth-1",
    publishingMode: "AUTO_PUBLISH",
    reviewCompleted: false,
    shadowMode: false,
    missionSource: "PACKAGE",
    qualityStatus: "PASS",
    complianceStatus: "PASS",
    releaseReadiness: { readyToRelease: true, reviewedArtifactVersion: "1" },
    exactArtifactVersion: "1",
  });
  assert.equal(packageAuto.allowed, true);

  const packageReview = decidePackagePublishGate({
    standingAuthorizationActive: true,
    authorizationId: "auth-1",
    publishingMode: "REVIEW_BEFORE_PUBLISH",
    reviewCompleted: false,
    shadowMode: false,
    missionSource: "PACKAGE",
    qualityStatus: "PASS",
    complianceStatus: "PASS",
  });
  assert.equal(packageReview.allowed, false);

  // Real schedule timestamps + timezone
  const intent = wallPartsToScheduleIntent(2026, 8, 15, 10, 30, "Asia/Kolkata");
  assert.ok(intent.scheduledAtIso);
  assert.ok(intent.wallClockLabel?.includes("2026-08-15"));
  assert.throws(
    () => buildScheduleIntent({ kind: "AT", timeZone: "Asia/Kolkata", scheduledAtIso: null }),
    SocialScheduleError,
  );

  const calendar = buildSocialCalendarFromSubPlan(
    {
      allocation: { images: 1, reels: 0, carousels: 0, stories: 0, totalUnits: 1 },
      connectedChannels: ["Instagram"],
      channelStatus: "CONNECTED",
      plannedUnits: [
        {
          id: "u1",
          deliverableKind: "image_post",
          objective: "Announce offer",
          details: { mediaType: "image", platform: "instagram" },
        },
      ],
    },
    "Asia/Kolkata",
    [{ plannedUnitId: "u1", scheduledAtIso: intent.scheduledAtIso! }],
  );
  assert.equal(calendar.length, 1);
  assert.ok(calendar[0].scheduledAtIso);

  assert.throws(
    () =>
      buildSocialCalendarFromSubPlan(
        {
          allocation: { images: 1, reels: 0, carousels: 0, stories: 0, totalUnits: 1 },
          connectedChannels: ["Instagram"],
          channelStatus: "CONNECTED",
          plannedUnits: [{ id: "u2", deliverableKind: "image_post", objective: "this week promo" }],
        },
        "Asia/Kolkata",
        [],
      ),
    SocialScheduleError,
  );

  // Publish idempotency / usage counted once
  const first = decideUsageConsumption({
    tenantId: "tenant-a",
    entitlementId: "ent-1",
    idempotencyKey: "job-1",
    countingPolicy: "CONTENT_UNIT",
    platforms: ["instagram", "facebook"],
  });
  assert.equal(first.consume, true);
  assert.equal(first.units, 1);
  const second = decideUsageConsumption({
    tenantId: "tenant-a",
    entitlementId: "ent-1",
    idempotencyKey: "job-1",
    countingPolicy: "CONTENT_UNIT",
    platforms: ["instagram", "facebook"],
  });
  assert.equal(second.consume, false);
  assert.equal(second.reason, "already_settled");

  const crossPost = decideUsageConsumption({
    tenantId: "tenant-a",
    entitlementId: "ent-1",
    idempotencyKey: "job-2",
    countingPolicy: "CONTENT_UNIT",
    platforms: ["facebook"],
    alreadyCountedForContentUnit: true,
  });
  assert.equal(crossPost.consume, false);

  // Failure retry does not regenerate content
  assert.equal(classifyPublishFailure("Meta 503 temporary"), "TECHNICAL_PUBLISH");
  const retry = prepareTechnicalRetry(release);
  assertTechnicalRetryPreservesArtifact(release, retry);

  // Publish receipt + analytics handoff
  const receipt = buildCanonicalPublishReceipt({
    release,
    scheduleJobId: "job-1",
    providerPublishId: "ext-123",
    publishedAtIso: "2026-08-15T05:00:00.000Z",
    liveUrl: "https://instagram.com/p/abc",
    usageAccountingRef: "usage:job-1",
    status: "PUBLISHED",
  });
  assert.equal(receipt.liveUrl, "https://instagram.com/p/abc");
  assert.equal(receipt.payloadFingerprint, release.payloadFingerprint);

  const inbound = createSocialInboundHandoff({
    tenantId: "tenant-a",
    missionId: "mission-1",
    planId: "plan-1",
    fromStage: "s_compliance",
    release,
  });
  assert.equal(inbound.toStage, "s_social_schedule");

  const outbound = createSocialOutboundHandoff({
    tenantId: "tenant-a",
    missionId: "mission-1",
    planId: "plan-1",
    receipt,
  });
  assert.equal(outbound.executionArtifact.kind, "publish_receipt");
  assert.equal(outbound.analyticsEvent.name, "workforce.social.analytics_target");
  const target = emitAnalyticsMeasurementTarget(receipt);
  assert.ok(target.measurementHints.includes("engagement"));

  // Social status query
  const status = queryPublicationStatusFromRecord({
    reference: "job-1",
    rawStatus: "PUBLISHED",
    liveUrl: "https://instagram.com/p/abc",
    providerPublishId: "ext-123",
    publishedAtIso: "2026-08-15T05:00:00.000Z",
    scheduleJobId: "job-1",
  });
  assert.equal(status.status, "PUBLISHED");
  const hermes = toHermesPublicationStatusPayload(status);
  assert.equal(hermes.status, "published");
  assert.ok(!JSON.stringify(hermes).includes("access_token"));

  // Package plan integration preserves composition
  const units = socialSubPlanToPackageUnits(
    {
      allocation: { images: 2, reels: 1, carousels: 0, stories: 0, totalUnits: 3 },
      connectedChannels: ["Instagram"],
      channelStatus: "CONNECTED",
      plannedUnits: [],
    },
    [
      { mediaType: "image", quantity: 2 },
      { mediaType: "reel", quantity: 1 },
    ],
  );
  assert.equal(units.length, 3);
  assert.equal(units.filter((u) => u.mediaType === "image").length, 2);

  // WhatsApp bridge contract
  assertWhatsAppUsesSharedSocialState();

  // Workflow includes Social department stages after quality
  const workflows = fs.readFileSync(path.join(root, "packages/workforce-core/src/planning/workflows.ts"), "utf8");
  assert.ok(workflows.includes('stageId: "s_social_schedule"'));
  assert.ok(workflows.includes('stageId: "s_social_publish"'));
  assert.ok(workflows.includes('"social.schedule"') && workflows.includes('"social.publish"'));

  // Capability registry untouched by this workstream (no social registry edits required here)
  const registry = fs.readFileSync(path.join(root, "packages/workforce-core/src/capabilities/registry.ts"), "utf8");
  assert.ok(registry.includes('"social.schedule"') && registry.includes('"social.publish"'));

  // Hermes publication status wired to Social department
  const hermesHandlers = fs.readFileSync(path.join(root, "apps/hermes-gateway/src/tool-handlers.ts"), "utf8");
  assert.ok(hermesHandlers.includes("lookupSocialPublicationStatus"));
  assert.ok(!hermesHandlers.includes('return { status: "unknown" };'));

  // Existing Social approval invariant still present
  const orchestrator = fs.readFileSync(path.join(root, "lib/social/agent/orchestrator.ts"), "utf8");
  assert.ok(orchestrator.includes("PUBLISH_INTENT_TOOLS.has(tool.schema.name)"));

  console.log("workforce-social-department.test.ts: ALL PASS");
}

run();
