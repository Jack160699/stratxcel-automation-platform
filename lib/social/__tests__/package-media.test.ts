// Tests selectPackageMediaAsset's asset-selection/rotation logic directly
// against a minimal fake Supabase query builder reproducing the exact chain
// this function calls (from/select/eq/eq/like/order/limit, awaited as a
// thenable -- no .maybeSingle() since the fix moved to a candidate pool).
// package-media.ts has no Supabase/queue/payments imports so its module
// graph resolves standalone under `node --experimental-strip-types`, unlike
// package-autopilot.ts (see package-autopilot-producer.test.ts's header).
// Run with: node --experimental-strip-types lib/social/__tests__/package-media.test.ts

import assert from "node:assert/strict";
import { selectPackageMediaAsset } from "../package-media.ts";

type AssetRow = { id: string; mime_type: string; tenant_id: string; owner_id: string; created_at: string; autopilot_eligible?: boolean };

function fakeServiceWithAssets(rows: AssetRow[]) {
  return {
    from(table: string) {
      assert.equal(table, "social_media_assets");
      const filters: Array<(row: AssetRow) => boolean> = [];
      let mimePrefix = "";
      let limitN = Infinity;
      const builder = {
        select(_cols: string) {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((row) => (row as unknown as Record<string, unknown>)[col] === val);
          return builder;
        },
        like(col: string, pattern: string) {
          assert.equal(col, "mime_type");
          mimePrefix = pattern.replace(/%$/, "");
          return builder;
        },
        order(col: string, opts: { ascending: boolean }) {
          assert.equal(col, "created_at");
          assert.equal(opts.ascending, false);
          return builder;
        },
        limit(n: number) {
          limitN = n;
          return builder;
        },
        then(resolve: (v: { data: AssetRow[]; error: null }) => unknown) {
          const matched = rows
            .filter((row) => filters.every((f) => f(row)))
            .filter((row) => row.mime_type.startsWith(mimePrefix))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limitN);
          return Promise.resolve({ data: matched, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as never;
}

async function testNoTextQuery() {
  // mediaType "text" must never hit the DB and must return null.
  const result = await selectPackageMediaAsset(fakeServiceWithAssets([]), {
    tenantId: "t1",
    ownerId: "o1",
    mediaType: "text",
  });
  assert.equal(result, null);
  console.log("package-media.test.ts: text mediaType short-circuits — PASS");
}

async function testNoAssetsThrows() {
  await assert.rejects(
    () => selectPackageMediaAsset(fakeServiceWithAssets([]), { tenantId: "t1", ownerId: "o1", mediaType: "image" }),
    /media_capability_unavailable/,
    "no uploaded asset of the required type must fail closed, never silently degrade to text"
  );
  console.log("package-media.test.ts: no assets throws media_capability_unavailable — PASS");
}

async function testBackwardCompatibleWithNoAvoidList() {
  // Same behavior as before the fix when no recent-use history is supplied:
  // the single newest matching asset.
  const rows: AssetRow[] = [
    { id: "old", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-01T00:00:00Z", autopilot_eligible: true },
    { id: "new", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-02-01T00:00:00Z", autopilot_eligible: true },
  ];
  const result = await selectPackageMediaAsset(fakeServiceWithAssets(rows), { tenantId: "t1", ownerId: "o1", mediaType: "image" });
  assert.equal(result?.id, "new");
  console.log("package-media.test.ts: no avoid list -> newest asset (backward compatible) — PASS");
}

async function testRotatesAwayFromRecentlyUsedAsset() {
  // THE regression this fix targets: a tenant with multiple uploaded photos
  // must not get the exact same one attached to every package post.
  const rows: AssetRow[] = [
    { id: "oldest", mime_type: "image/jpeg", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-01T00:00:00Z", autopilot_eligible: true },
    { id: "middle", mime_type: "image/jpeg", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-15T00:00:00Z", autopilot_eligible: true },
    { id: "newest", mime_type: "image/jpeg", tenant_id: "t1", owner_id: "o1", created_at: "2026-02-01T00:00:00Z", autopilot_eligible: true },
  ];
  const result = await selectPackageMediaAsset(fakeServiceWithAssets(rows), {
    tenantId: "t1",
    ownerId: "o1",
    mediaType: "image",
    avoidAssetIds: ["newest"],
  });
  assert.equal(result?.id, "middle", "must skip the recently-used newest asset and pick the next newest instead");
  console.log("package-media.test.ts: rotates away from a recently-used asset — PASS");
}

async function testNeverBlocksWhenEverythingWasRecentlyUsed() {
  // Only one asset exists (or every fetched candidate was recently used):
  // variety is a preference, not a hard requirement -- must still return an
  // asset rather than throwing and blocking the post.
  const rows: AssetRow[] = [{ id: "only", mime_type: "video/mp4", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-01T00:00:00Z", autopilot_eligible: true }];
  const result = await selectPackageMediaAsset(fakeServiceWithAssets(rows), {
    tenantId: "t1",
    ownerId: "o1",
    mediaType: "reel",
    avoidAssetIds: ["only"],
  });
  assert.equal(result?.id, "only", "falling back to a recently-used asset must never throw — a post should never be blocked purely for lack of variety");
  console.log("package-media.test.ts: falls back instead of blocking when no fresh candidate exists — PASS");
}

// --- STRATXCEL FINAL REMAINING BLOCKERS mission (Sections 4-8): before this
//     fix, a Creative Studio poster, the business's own raw logo file, or a
//     64x64 logo-mark variant was structurally selectable as a post's main
//     photo -- confirmed live: 28 of 34 real StratXcel assets were exactly
//     this kind of unsafe candidate. autopilot_eligible is the real,
//     DB-level hard boundary. ---
async function testQuarantinedAssetIsNeverSelected() {
  const rows: AssetRow[] = [
    { id: "bad-poster", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-02-01T00:00:00Z", autopilot_eligible: false },
    { id: "good-photo", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-01T00:00:00Z", autopilot_eligible: true },
  ];
  const result = await selectPackageMediaAsset(fakeServiceWithAssets(rows), { tenantId: "t1", ownerId: "o1", mediaType: "image" });
  assert.equal(result?.id, "good-photo", "a quarantined (autopilot_eligible=false) asset must never be selected, even when it's the newest candidate");
  console.log("package-media.test.ts: a quarantined asset (e.g. a Creative Studio poster or the business's own logo) is never selected, even as the newest candidate — PASS");
}

async function testAllAssetsQuarantinedFailsClosed() {
  // Real production state found live: this exact tenant currently has ZERO
  // autopilot_eligible=true assets (all 34 are BRAND_LOGO or
  // MARKETING_GRAPHIC) -- must fail closed (media_capability_unavailable),
  // never silently fall back to a quarantined asset just to avoid blocking
  // the post (Section 10: "generation unavailable -> silently select old
  // Brand Library poster" is explicitly forbidden).
  const rows: AssetRow[] = [
    { id: "logo", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-02-01T00:00:00Z", autopilot_eligible: false },
    { id: "poster", mime_type: "image/png", tenant_id: "t1", owner_id: "o1", created_at: "2026-01-01T00:00:00Z", autopilot_eligible: false },
  ];
  await assert.rejects(
    () => selectPackageMediaAsset(fakeServiceWithAssets(rows), { tenantId: "t1", ownerId: "o1", mediaType: "image" }),
    /media_capability_unavailable/,
    "when every real asset is quarantined, this must fail closed -- never silently select a quarantined asset just to produce something"
  );
  console.log("package-media.test.ts: fails closed (never selects a quarantined asset) when every real asset is quarantined — PASS");
}

async function run() {
  await testNoTextQuery();
  await testNoAssetsThrows();
  await testBackwardCompatibleWithNoAvoidList();
  await testRotatesAwayFromRecentlyUsedAsset();
  await testNeverBlocksWhenEverythingWasRecentlyUsed();
  await testQuarantinedAssetIsNeverSelected();
  await testAllAssetsQuarantinedFailsClosed();
  console.log("package-media.test.ts: ALL PASS (media capability gating, creative-diversity rotation, never-block fallback, autopilot_eligible quarantine boundary)");
}

run();
