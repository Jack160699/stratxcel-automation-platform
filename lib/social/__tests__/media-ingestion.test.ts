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
  const privateAuthorization = {
    ...scope,
    platform: "youtube",
    purpose: "YOUTUBE_PRIVATE_VERIFICATION",
    privacyStatus: "private",
    status: "ACTIVE",
    expiresAt: "2026-07-29T10:10:00.000Z",
  };
  const unlistedAuthorization = { ...privateAuthorization, privacyStatus: "unlisted" };
  const privateInput = { accountPlatform: "youtube", privacyStatus: "private", assetMimeType: "video/mp4", now };
  const unlistedInput = { ...privateInput, privacyStatus: "unlisted" };

  assert.equal(verificationAuthorizationAllows(privateAuthorization, scope, privateInput), true);
  assert.equal(verificationAuthorizationAllows(unlistedAuthorization, scope, unlistedInput), true);
  assert.equal(verificationAuthorizationAllows({ ...privateAuthorization, privacyStatus: null }, scope, privateInput), true);
  for (const [field, value] of [
    ["ownerId", "other-owner"],
    ["accountId", "other-account"],
    ["variantId", "other-variant"],
    ["assetId", "other-asset"],
    ["jobId", "other-job"],
  ] as const) {
    assert.equal(verificationAuthorizationAllows(privateAuthorization, { ...scope, [field]: value }, privateInput), false);
  }
  assert.equal(verificationAuthorizationAllows({ ...privateAuthorization, purpose: "YOUTUBE_VERIFICATION" }, scope, privateInput), false);
  assert.equal(verificationAuthorizationAllows({ ...privateAuthorization, platform: "linkedin" }, scope, privateInput), false);
  assert.equal(verificationAuthorizationAllows({ ...privateAuthorization, status: "CONSUMED" }, scope, privateInput), false);
  assert.equal(verificationAuthorizationAllows({ ...privateAuthorization, expiresAt: "2026-07-29T09:59:00.000Z" }, scope, privateInput), false);
  assert.equal(verificationAuthorizationAllows(privateAuthorization, scope, { ...privateInput, accountPlatform: "linkedin" }), false);
  assert.equal(verificationAuthorizationAllows(privateAuthorization, scope, { ...privateInput, assetMimeType: "image/png" }), false);
  assert.equal(verificationAuthorizationAllows(privateAuthorization, scope, { ...privateInput, privacyStatus: "public" }), false);
  assert.equal(verificationAuthorizationAllows(unlistedAuthorization, scope, privateInput), false);
  assert.equal(accessTokenNeedsRefresh(null, now), false);
  assert.equal(accessTokenNeedsRefresh("2026-07-29T10:00:30.000Z", now), true);
  assert.equal(accessTokenNeedsRefresh("2026-07-29T10:02:00.000Z", now), false);
  assert.equal(accessTokenNeedsRefresh("not-a-date", now), true);

  const mediaMigration = read("supabase", "migrations", "20260729094500_media_ingestion.sql");
  const verificationMigration = read("supabase", "migrations", "20260728235714_add_verification_privacy.sql");
  const mediaRepo = read("lib", "social", "repositories", "media-assets.ts");
  const attachmentRepo = read("lib", "social", "repositories", "agent-attachments.ts");
  const tools = read("lib", "social", "agent", "tools.ts");
  const orchestrator = read("lib", "social", "agent", "orchestrator.ts");
  const worker = read("lib", "social", "worker.ts");
  const verification = read("lib", "social", "verification-publish.ts");
  const approvalUi = read("app", "admin", "social", "agent", "AgentMessage.tsx");
  const createAction = read("app", "admin", "social", "actions.ts");
  const createUploader = read("app", "admin", "social", "create", "MediaUploader.tsx");
  const approvalRoute = read("app", "api", "social", "copilot", "actions", "[actionId]", "route.ts");

  assert.ok(mediaMigration.includes("social_media_assets_owner") && mediaMigration.includes("owner_id = (select auth.uid())"));
  assert.ok(mediaMigration.includes("social_content_master_media") && mediaMigration.includes("social_content_variant_media"));
  assert.ok(mediaMigration.includes("mime_type = 'video/mp4'") && mediaMigration.includes("status = 'READY'"));
  assert.ok(verificationMigration.includes("ADD COLUMN IF NOT EXISTS privacy_status text"));
  assert.ok(verificationMigration.includes("IF NOT EXISTS (") && verificationMigration.includes("social_verification_publish_authorizations_privacy_check"));
  assert.ok(verificationMigration.includes("ALTER COLUMN privacy_status SET NOT NULL"));
  assert.ok(mediaRepo.includes("stored.mimeType !== asset.mime_type") && mediaRepo.includes("stored.sizeBytes !== Number(asset.size_bytes)"));
  assert.ok(attachmentRepo.includes("media_asset_id"), "canonical media identity remains available to local publishing code");
  assert.ok(attachmentRepo.includes("loadImageAttachmentsForModel"), "image-only missions must load actual private image bytes for creative understanding");
  assert.ok(attachmentRepo.includes('Buffer.from(await blob.arrayBuffer()).toString("base64")'), "vision input must be inline rather than a public URL");
  assert.equal(orchestrator.includes("mediaAssetId=${attachment.media_asset_id}"), false, "media identifiers never enter external AI prompts");
  assert.ok(orchestrator.includes("creativeImages"), "the orchestrator must supply image pixels to the creative provider boundary");
  const copilotFullPage = read("app", "admin", "social", "copilot", "CopilotFullPage.tsx");
  assert.ok(copilotFullPage.includes("imageOnlyMission"), "an image-only submission must start a guided capability mission");
  assert.ok(copilotFullPage.includes('readyAttachments.length === 0'), "Send must allow ready attachments without typed prompt text");
  assert.ok(copilotFullPage.includes('uploadState === "failed"'), "one failed upload must not discard successful files");
  assert.ok(
    orchestrator.includes("const MAX_TOOL_ROUNDS = 8"),
    "media workflows need enough bounded rounds for inspection before the final proposal"
  );
  for (const tool of ["ingest_media", "attach_media_to_content", "inspect_content_media", "update_content_variant"]) {
    assert.ok(tools.includes(`name: "${tool}"`), `Agent tool ${tool} must exist`);
  }
  assert.ok(tools.includes('name: "execute_youtube_verification"'));
  assert.ok(tools.includes('name: "execute_private_youtube_verification"'));
  assert.ok(tools.includes('privacyStatus: { type: "string", enum: ["private", "unlisted"] }'));
  assert.ok(!tools.includes('privacyStatus: { type: "string", enum: ["private", "unlisted", "public"] }'));
  assert.ok(verification.includes('return executeYoutubeVerification(ctx, { ...input, privacyStatus: "private" });'));
  assert.ok(verification.includes('input: { accountId: string; variantId: string; assetId: string; privacyStatus: "private" | "unlisted" }'));
  assert.ok(verification.includes('const allowed = ["private", "unlisted"] as const;'));
  assert.ok(verification.includes('privacy_status: input.privacyStatus'));
  assert.ok(verification.includes('const keyPrefix = input.privacyStatus === "private" ? "youtube-private-verification" : "youtube-verification";'));
  assert.ok(createUploader.includes("uploadToSignedUrlWithProgress") && createUploader.includes('name="media_asset_ids"'));
  assert.ok(createAction.includes("attachMediaToMaster") && createAction.includes("attachMediaToVariant"));
  assert.ok(worker.includes("resolveMediaForPublish") && worker.includes("createSignedUrl") === false);
  assert.ok(mediaRepo.includes("createSignedUrl(asset.storage_path, 60 * 60)"));
  assert.ok(worker.includes('.eq("publishing_job_id", job.id)') && worker.includes('.eq("status", "ACTIVE")'));
  assert.ok(worker.includes('.eq("privacy_status", verificationPrivacy)'));
  assert.ok(worker.includes('verificationPrivacy !== "private" && verificationPrivacy !== "unlisted"'));
  assert.ok(worker.includes('action: "youtube.verification_authorization.consume"'));
  assert.ok(worker.includes("Consumed one-time YouTube ${verificationPrivacy} verification authorization"));
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
  assert.ok(worker.includes('mode: isLive ? (verificationUpload ? "verification_live" : "live") : "shadow"'));
  assert.ok(approvalUi.includes('execute_youtube_verification: "Upload YouTube verification video"'));
  assert.ok(approvalUi.includes('execute_private_youtube_verification: "Upload private YouTube verification video"'));
  assert.ok(approvalUi.includes('Visibility: {visibility}'));
  assert.ok(approvalUi.includes('tool === "execute_private_youtube_verification"') && approvalUi.includes('tool !== "execute_youtube_verification"'));
  assert.ok(
    approvalRoute.includes("requireOwnerContext") &&
      approvalRoute.includes("approveAgentAction(ctx, actionId)") &&
      approvalRoute.includes("rejectAgentAction(ctx, actionId)") &&
      approvalRoute.includes("maxDuration = 300"),
    "the authenticated approval endpoint must reuse the owner-scoped approval path"
  );

  console.log(
    "media-ingestion.test.ts: ALL PASS (verification privacy scope, worker consume guard, approval visibility, no duplicate replay)"
  );
}

run();
