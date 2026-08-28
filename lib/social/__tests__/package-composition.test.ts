import assert from "node:assert/strict";
import {
  compositionMediaTypeForUnit,
  compositionUnitTotal,
  formatPackageCompositionLabel,
  PLAN_PACKAGE_COMPOSITIONS,
  resolvePurchasedPackageComposition,
  validatePackageComposition,
} from "../package-composition.ts";

function run() {
  const mixed = validatePackageComposition({
    items: [
      { mediaType: "image", quantity: 20 },
      { mediaType: "reel", quantity: 8 },
    ],
    countingPolicy: "CONTENT_UNIT",
    allowedPlatforms: ["Instagram", "LinkedIn"],
    publishingMode: "AUTO_PUBLISH",
    servicePeriodDays: 30,
  });
  assert.equal(compositionMediaTypeForUnit(mixed, 0), "image");
  assert.equal(compositionMediaTypeForUnit(mixed, 20), "reel");
  assert.equal(compositionMediaTypeForUnit(mixed, 28), null);

  // Purchased image package remains image (no silent text conversion).
  const imageOnly = resolvePurchasedPackageComposition({
    planTier: "image_30",
    allowedPlatforms: ["instagram"],
    publishingMode: "AUTO_PUBLISH",
    entitlementLimit: 30,
  });
  assert.ok(imageOnly);
  assert.deepEqual(imageOnly!.items, [{ mediaType: "image", quantity: 30 }]);
  assert.equal(compositionMediaTypeForUnit(imageOnly!, 0), "image");
  assert.equal(compositionMediaTypeForUnit(imageOnly!, 29), "image");
  assert.ok(!imageOnly!.items.some((item) => item.mediaType === "text"));

  // Remove Reels mission: growth catalog is now all-image (was 20 image + 5
  // reel) -- the full purchased total (25) is preserved, just as images,
  // since no real video-generation capability exists anywhere to fulfill a
  // reel unit (selectPackageMediaAsset fails closed with
  // media_capability_unavailable for every tenant today).
  const growth = resolvePurchasedPackageComposition({
    planTier: "growth",
    allowedPlatforms: ["instagram", "linkedin"],
    publishingMode: "AUTO_PUBLISH",
    entitlementLimit: 25,
  });
  assert.ok(growth);
  assert.deepEqual(growth!.items, [{ mediaType: "image", quantity: 25 }]);
  assert.equal(compositionUnitTotal(growth!.items), 25);
  assert.equal(formatPackageCompositionLabel(growth!.items), "25 image posts");
  assert.equal(compositionMediaTypeForUnit(growth!, 19), "image");
  assert.equal(compositionMediaTypeForUnit(growth!, 24), "image");
  assert.equal(compositionMediaTypeForUnit(growth!, 25), null);
  assert.ok(!growth!.items.some((item) => item.mediaType === "reel"), "the growth catalog must no longer allocate any unit to reel/video");

  // Starter / launch mixed 12 units
  const starter = resolvePurchasedPackageComposition({
    planTier: "starter",
    allowedPlatforms: ["instagram"],
    publishingMode: "AUTO_PUBLISH",
  });
  assert.ok(starter);
  assert.equal(compositionUnitTotal(starter!.items), 12);
  assert.deepEqual(PLAN_PACKAGE_COMPOSITIONS.starter, PLAN_PACKAGE_COMPOSITIONS.launch);

  // Missing composition blocks activation (free / unknown).
  assert.equal(
    resolvePurchasedPackageComposition({
      planTier: "free",
      allowedPlatforms: ["instagram"],
      publishingMode: "AUTO_PUBLISH",
    }),
    null
  );
  assert.equal(
    resolvePurchasedPackageComposition({
      planTier: "unknown_custom",
      allowedPlatforms: ["instagram"],
      publishingMode: "AUTO_PUBLISH",
      entitlementLimit: 12,
    }),
    null,
    "unknown plan must NOT invent text×N from entitlement"
  );
  assert.equal(
    resolvePurchasedPackageComposition({
      planTier: null,
      allowedPlatforms: ["instagram"],
      publishingMode: "AUTO_PUBLISH",
      entitlementLimit: 30,
    }),
    null,
    "no text fallback when composition is absent"
  );

  // All-text compositions are rejected (would silently demote media packages).
  assert.throws(
    () =>
      validatePackageComposition({
        items: [{ mediaType: "text", quantity: 12 }],
        countingPolicy: "CONTENT_UNIT",
        allowedPlatforms: ["instagram"],
        publishingMode: "AUTO_PUBLISH",
        servicePeriodDays: 30,
      }),
    /package_configuration_required/
  );

  console.log("package-composition.test.ts: ALL PASS");
}

run();
