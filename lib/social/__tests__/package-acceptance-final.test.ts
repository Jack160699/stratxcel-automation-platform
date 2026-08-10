import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const preview = read("lib", "social", "package-preview.ts");
  const api = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const ui = read("app", "app", "content", "autopilot", "AutopilotDashboard.tsx");
  const previewUi = read("app", "app", "content", "autopilot", "PackagePublishPreview.tsx");
  const autopilot = read("lib", "social", "package-autopilot.ts");
  const composition = read("lib", "social", "package-composition.ts");

  // Real package preview source of truth
  for (const token of ["getPackageQueueItemPreview", "social_content_variant_media", "content_variants", "social_accounts", "createSignedUrl", "mediaAssetIds", "hashtags", "caption"]) {
    assert.ok(preview.includes(token), token);
  }
  assert.ok(api.includes('case "preview"'));
  assert.ok(api.includes("getPackageQueueItemPreview"));
  assert.ok(previewUi.includes("PackagePublishPreviewCard"));
  assert.ok(previewUi.includes("preview.media"));
  assert.ok(ui.includes("action: \"preview\""));
  assert.ok(ui.includes("PackagePublishPreviewCard"));
  assert.ok(!ui.includes("item.scheduledAt.slice(0, 16)"), "must not treat UTC as browser-local wall time");

  // Media included in preview
  assert.ok(preview.includes("media:"));
  assert.ok(previewUi.includes("mimeType.startsWith(\"video/\")") || previewUi.includes('mimeType.startsWith("video/")'));

  // No text fallback for activation — composition from purchased catalog only
  assert.ok(!api.includes('mediaType: "text", quantity: Number(body.packageSize'));
  assert.ok(!autopilot.includes('mediaType: "text", quantity:'));
  assert.ok(api.includes("resolvePurchasedPackageComposition"));
  assert.ok(autopilot.includes("package_configuration_required"));
  assert.ok(composition.includes("PLAN_PACKAGE_COMPOSITIONS"));
  assert.ok(composition.includes("resolvePurchasedPackageComposition"));
  assert.ok(composition.includes("image_30"));
  assert.ok(ui.includes("packageConfigured"));
  assert.ok(ui.includes("compositionLabel"));
  assert.ok(ui.includes("Package configuration required") || ui.includes("needs setup"));

  // Timezone-safe reschedule
  assert.ok(api.includes("scheduledWall"));
  assert.ok(api.includes("reschedulePackageQueueItemInTimezone"));
  assert.ok(ui.includes("scheduledWall"));
  assert.ok(autopilot.includes("datetimeLocalValueToUtcIso"));

  // Publish lifecycle / period / settlement audits
  for (const action of [
    "social.package.publish_attempted",
    "social.package.publish_succeeded",
    "social.package.publish_failed",
    "social.package.publish_reconciliation_required",
    "social.package.entitlement_settled",
    "social.package.service_period_rolled",
  ]) {
    assert.ok(autopilot.includes(action), action);
  }
  assert.ok(autopilot.includes("already_settled"), "settlement audit must stay idempotent under retries");

  console.log("package-acceptance-final.test.ts: ALL PASS");
}

run();
