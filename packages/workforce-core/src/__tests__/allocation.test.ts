// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/allocation.test.ts
import assert from "node:assert/strict";
import {
  enforceSocialAllocation,
  resolveAllocationPolicy,
  snapshotFromContract,
} from "../planning/allocation.ts";
import { AllocationPolicyError } from "../planning/types.ts";

function run() {
  const starter = snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [
      { mediaType: "image", quantity: 8 },
      { mediaType: "reel", quantity: 4 },
    ],
    relevantEntitlements: { social_posts: 12 },
  });
  assert.equal(resolveAllocationPolicy(starter), "FIXED_COMPOSITION");
  const starterAlloc = enforceSocialAllocation(starter, { images: 4, reels: 8 });
  assert.deepEqual(starterAlloc, { images: 8, reels: 4, carousels: 0, stories: 0, totalUnits: 12 });

  const growth = snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [
      { mediaType: "image", quantity: 20 },
      { mediaType: "reel", quantity: 5 },
    ],
    relevantEntitlements: { social_posts: 25 },
  });
  const growthAlloc = enforceSocialAllocation(growth, {});
  assert.equal(growthAlloc.images, 20);
  assert.equal(growthAlloc.reels, 5);

  const business = snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [
      { mediaType: "image", quantity: 40 },
      { mediaType: "reel", quantity: 10 },
    ],
    relevantEntitlements: { social_posts: 50 },
  });
  const businessAlloc = enforceSocialAllocation(business, {});
  assert.equal(businessAlloc.images, 40);
  assert.equal(businessAlloc.reels, 10);

  const image30 = snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [{ mediaType: "image", quantity: 30 }],
    relevantEntitlements: { social_posts: 30 },
  });
  assert.equal(enforceSocialAllocation(image30, {}).images, 30);

  const flexible = snapshotFromContract({
    allocationPolicy: "FLEXIBLE_COMPOSITION",
    packageComposition: [],
    relevantEntitlements: { social_content_units: 12 },
  });
  const flexAlloc = enforceSocialAllocation(flexible, { images: 7, reels: 5 });
  assert.equal(flexAlloc.totalUnits, 12);

  const unknown = snapshotFromContract({
    allocationPolicy: "UNKNOWN",
    packageComposition: [],
    relevantEntitlements: {},
  });
  assert.throws(() => enforceSocialAllocation(unknown, {}), AllocationPolicyError);

  console.log("allocation.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
