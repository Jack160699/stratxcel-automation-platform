import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMediaMetadata } from "../media-validation.ts";
import { verificationAuthorizationAllows } from "../verification-policy.ts";
import { accessTokenNeedsRefresh } from "../token-lifecycle.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  assert.equal(validateMediaMetadata({ name: "demo.mp4", mimeType: "video/mp4", sizeBytes: 1024 }), null);
  assert.equal(validateMediaMetadata({ name: "photo.JPG", mimeType: "image/jpeg", sizeBytes: 1024 }), null);
  assert.match(validateMediaMetadata({ name: "demo.exe", mimeType: "video/mp4", sizeBytes: 1024 }) ?? "", /does not match/);
  assert.match(validateMediaMetadata({ name: "demo.mp4", mimeType: "application/octet-stream", sizeBytes: 1024 }) ?? "", /Unsupported/);
  assert.match(validateMediaMetadata({ name: "demo.mp4", mimeType: "video/mp4", sizeBytes: 101 * 1024 * 1024 }) ?? "", /100 MB/);

  const now = Date.parse("2026-07-29T10:00:00.000Z");
  const scope = { ownerId: "owner", accountId: "account", variantId: "variant", assetId: "asset", jobId: "job" };
  const authorization = {
    ...scope,
    platform: "youtube",
    purpose: "YOUTUBE_PRIVATE_VERIFICATION",
    status: "ACTIVE",
    expiresAt: "2026-07-29T10:10:00.000Z",
  };
  const providerInput = { accountPlatform: "youtube", privacyStatus: "private", assetMimeType: "video/mp4", now };
  assert.equal(verificationAuthorizationAllows(authorization, scope, providerInput), true);
  for (const [field, value] of [
    ["ownerId", "other-owner"],
    ["accountId", "other-account"],
    ["variantId", "other-variant"],
    ["assetId", "other-asset"],
    ["jobId", "other-job"],
  ] as const) {
    assert.equal(verificationAuthorizationAllows(authorization, { ...scope, [field]: value }, providerInput), false);
  }
  assert.equal(verificationAuthorizationAllows({ ...authorization, status: "CONSUMED" }, scope, providerInput), false);
  assert.equal(verificationAuthorizationAllows({ ...authorization, expiresAt: "2026-07-29T09:59:00.000Z" }, scope, providerInput), false);
  assert.equal(verificationAuthorizationAllows(authorization, scope, { ...providerInput, privacyStatus: "public" }), false);
  assert.equal(accessTokenNeedsRefresh(null, now), false);
  assert.equal(accessTokenNeedsRefresh("2026-07-29T10:00:30.000Z", now), true);
  assert.equal(accessTokenNeedsRefresh("2026-07-29T10:02:00.000Z", now), false);
  assert.equal(accessTokenNeedsRefresh("not-a-date", now), true);

  const migration = read("supabase", "migrations", "20260729094500_media_ingestion.sql");
  const mediaRepo = read("lib", "social", "repositories", "media-assets.ts");
  const attachmentRepo = read("lib", "social", "repositories", "agent-attachments.ts");
  const tools = read("lib", "social", "agent", "tools.ts");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  const worker = read("lib", "social", "worker.ts");
  const verification = read("lib", "social", "verification-publish.ts");
  const createAction = read("app", "admin", "social", "actions.ts");
  const createUploader = read("app", "admin", "social", "create", "MediaUploader.tsx");
  const approvalRoute = read("app", "api", "social", "copilot", "actions", "[actionId]", "route.ts");

  assert.ok(migration.includes("social_media_assets_owner") && migration.includes("owner_id = (select auth.uid())"));
  assert.ok(migration.includes("social_content_master_media") && migration.includes("social_content_variant_media"));
  assert.ok(migration.includes("mime_type = 'video/mp4'") && migration.includes("status = 'READY'"));
  assert.ok(mediaRepo.includes("stored.mimeType !== asset.mime_type") && mediaRepo.includes("stored.sizeBytes !== Number(asset.size_bytes)"));
  assert.ok(attachmentRepo.includes("media_asset_id") && orchestrator.includes("mediaAssetId=${attachment.media_asset_id}"));
  assert.ok(
    orchestrator.includes("const MAX_TOOL_ROUNDS = 8"),
    "media workflows need enough bounded rounds for inspection before the final proposal"
  );
  for (const tool of ["ingest_media", "attach_media_to_content", "inspect_content_media", "update_content_variant"]) {
    assert.ok(tools.includes(`name: "${tool}"`), `Agent tool ${tool} must exist`);
  }
  assert.ok(tools.includes('name: "execute_private_youtube_verification"'));
  assert.ok(createUploader.includes("uploadToSignedUrlWithProgress") && createUploader.includes('name="media_asset_ids"'));
  assert.ok(createAction.includes("attachMediaToMaster") && createAction.includes("attachMediaToVariant"));
  assert.ok(worker.includes("resolveMediaForPublish") && worker.includes("createSignedUrl") === false);
  assert.ok(mediaRepo.includes("createSignedUrl(asset.storage_path, 60 * 60)"));
  assert.ok(worker.includes('.eq("publishing_job_id", job.id)') && worker.includes('.eq("status", "ACTIVE")'));
  assert.ok(
    worker.indexOf("getValidProviderAccessToken(service, account)") <
      worker.indexOf('.update({ status: "CONSUMED"'),
    "credentials must refresh before the one-time authorization is consumed"
  );
  assert.ok(
    worker.includes("Boolean(verification)") &&
      worker.includes('accountPlatform === "youtube"') &&
      verification.includes("runAuthorizedVerificationJob"),
    "YouTube errors must not enter an automatic replay path that can duplicate an accepted upload"
  );
  assert.ok(verification.includes("youtube-private-verification:${authorization.id}"));
  assert.ok(verification.includes("attachMediaToVariant") && verification.includes('youtubePrivacyStatus: "private"'));
  assert.ok(
    approvalRoute.includes("requireOwnerContext") &&
      approvalRoute.includes("approveAgentAction(ctx, actionId)") &&
      approvalRoute.includes("rejectAgentAction(ctx, actionId)") &&
      approvalRoute.includes("maxDuration = 300"),
    "the authenticated approval endpoint must reuse the owner-scoped approval path"
  );

  console.log("media-ingestion.test.ts: ALL PASS (validation, owner RLS, stable assets, Agent handoff, exact one-time verification scope)");
}

run();
