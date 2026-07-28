import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeYouTubePrivacyStatus } from "../providers/youtube-visibility.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  assert.equal(normalizeYouTubePrivacyStatus(undefined), "private");
  assert.equal(normalizeYouTubePrivacyStatus("unexpected"), "private");
  assert.equal(normalizeYouTubePrivacyStatus("unlisted"), "unlisted");
  assert.equal(normalizeYouTubePrivacyStatus("public"), "public");

  const actions = read("app", "admin", "social", "actions.ts");
  const worker = read("lib", "social", "worker.ts");
  const publishing = read("lib", "social", "repositories", "publishing.ts");
  const youtube = read("lib", "social", "providers", "youtube.ts");
  assert.ok(
    actions.includes("runWorkerBatch({ ownerId: ctx.ownerId })"),
    "manual worker runs must be restricted to the active owner"
  );
  assert.ok(
    publishing.includes('.eq("owner_id", ownerId)') &&
      publishing.includes('.in("account_id", ownerAccountIds)'),
    "owner-scoped worker claims must resolve and filter the owner's accounts"
  );
  assert.ok(
    worker.includes("normalizeYouTubePrivacyStatus(variant.creative_spec?.youtube_privacy_status)"),
    "the exact saved YouTube visibility must reach the provider"
  );
  assert.ok(
    youtube.includes("const privacyStatus = normalizeYouTubePrivacyStatus(input.privacyStatus)") &&
      youtube.includes("status: { privacyStatus }") &&
      youtube.includes("uploadType=multipart&part=snippet,status"),
    "the normalized visibility must be sent atomically with the YouTube upload"
  );
  assert.ok(
    youtube.includes("const multipartBody = Buffer.concat") &&
      !youtube.includes('method: "PUT"'),
    "the provider must not create a metadata-less upload before setting privacy"
  );
  assert.ok(
    actions.includes('ctx.supabase.from("social_accounts")') &&
      actions.includes('ctx.supabase.from("content_variants")') &&
      actions.includes("account.platform !== variant.platform"),
    "scheduling must validate owner-visible targets and matching platforms"
  );

  console.log(
    "youtube-publishing.test.ts: ALL PASS (private default, unlisted propagation, atomic upload metadata, owner-scoped worker, schedule ownership)"
  );
}

run();
