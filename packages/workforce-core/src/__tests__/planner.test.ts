// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/planner.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { planThirtyDayGrowth } from "../planning/thirty-day-planner.ts";
import type { ThirtyDayPlannerInput } from "../planning/types.ts";
import { AllocationPolicyError } from "../planning/types.ts";

function baseInput(snapshot: ReturnType<typeof snapshotFromContract>): ThirtyDayPlannerInput {
  return {
    tenantId: "tenant-1",
    missionId: "mission-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Test Co", industry: "services" },
    productsServices: [],
    targetAudience: "local homeowners",
    geography: "City",
    positioning: "Trusted local brand",
    connectedChannels: ["Instagram"],
    businessGoals: ["Grow leads"],
    previousPerformance: [],
    existingResearchEvidence: [],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshot,
    budgetEnvelope: createMissionBudget(50000),
  };
}

function run() {
  const starter = planThirtyDayGrowth(
    baseInput(
      snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [
          { mediaType: "image", quantity: 8 },
          { mediaType: "reel", quantity: 4 },
        ],
        relevantEntitlements: { social_posts: 12 },
      }),
    ),
  );
  assert.equal(starter.socialAllocation.images, 8);
  assert.equal(starter.socialAllocation.reels, 4);

  const growth = planThirtyDayGrowth(
    baseInput(
      snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [
          { mediaType: "image", quantity: 20 },
          { mediaType: "reel", quantity: 5 },
        ],
        relevantEntitlements: { social_posts: 25 },
      }),
    ),
  );
  assert.equal(growth.socialAllocation.images, 20);
  assert.equal(growth.socialAllocation.reels, 5);

  const business = planThirtyDayGrowth(
    baseInput(
      snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [
          { mediaType: "image", quantity: 40 },
          { mediaType: "reel", quantity: 10 },
        ],
        relevantEntitlements: { social_posts: 50 },
      }),
    ),
  );
  assert.equal(business.socialAllocation.images, 40);
  assert.equal(business.socialAllocation.reels, 10);

  const image30 = planThirtyDayGrowth(
    baseInput(
      snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [{ mediaType: "image", quantity: 30 }],
        relevantEntitlements: { social_posts: 30 },
      }),
    ),
  );
  assert.equal(image30.socialAllocation.images, 30);
  assert.equal(image30.socialAllocation.reels, 0);

  const flexible = planThirtyDayGrowth(
    baseInput(
      snapshotFromContract({
        allocationPolicy: "FLEXIBLE_COMPOSITION",
        packageComposition: [],
        relevantEntitlements: { social_content_units: 12 },
      }),
    ),
  );
  assert.ok(flexible.socialAllocation.totalUnits <= 12);

  assert.throws(
    () =>
      planThirtyDayGrowth(
        baseInput(
          snapshotFromContract({
            allocationPolicy: "UNKNOWN",
            packageComposition: [],
            relevantEntitlements: {},
          }),
        ),
      ),
    AllocationPolicyError,
  );

  const interior = planThirtyDayGrowth({
    ...baseInput(
      snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [
          { mediaType: "image", quantity: 8 },
          { mediaType: "reel", quantity: 4 },
        ],
        relevantEntitlements: { social_posts: 12 },
      }),
    ),
    brandBrain: {
      business_name: "Luxe Interiors Bhilai",
      industry: "interior design",
      target_audience: "premium homeowners",
      tone_of_voice: "refined, warm, expert",
    },
    geography: "Bhilai/Raipur",
    connectedChannels: ["Instagram", "Facebook"],
    positioning: "Premium interior design for discerning local homeowners",
  });

  assert.equal(interior.socialAllocation.images, 8);
  assert.equal(interior.socialAllocation.reels, 4);
  const purposes = new Set(interior.plannedDeliverables.map((d) => d.funnelPurpose));
  assert.ok(purposes.size >= 4, "Expected varied funnel purposes");
  assert.ok(purposes.has("awareness"));
  assert.ok(purposes.has("education") || purposes.has("authority"));
  assert.ok(purposes.has("proof") || purposes.has("offer") || purposes.has("conversion"));

  const researchRequired = interior.knowledgeClaims.filter((c) => c.status === "RESEARCH_REQUIRED");
  assert.ok(researchRequired.length >= 1);
  assert.ok(
    !interior.knowledgeClaims.some(
      (c) => c.status === "KNOWN" && /\d+%|\d+\s+customers|market size/i.test(c.claim),
    ),
    "Should not fabricate statistics as KNOWN",
  );

  console.log("planner.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
