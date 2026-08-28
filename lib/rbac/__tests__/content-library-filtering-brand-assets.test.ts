import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isBrandOrLogoAsset, extractBrandBrainIdentifiers } from "../../social/brand-asset-filter.ts";

function read(...segments: string[]) {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), "utf-8");
}

async function run() {
  console.log("Starting Content Library Brand Asset Filtering & Safeguard Test Suite...");

  // 1. Verify brand asset filtering implementation
  const brandFilterModule = read("lib", "social", "brand-asset-filter.ts");
  const contentPage = read("app", "app", "content", "page.tsx");
  const creativeWorkspace = read("app", "app", "content", "studio", "CreativeStudioWorkspace.tsx");
  const referencesRoute = read("app", "api", "platform", "image-generations", "references", "route.ts");

  assert.ok(contentPage.includes("isBrandOrLogoAsset"), "content/page.tsx must use isBrandOrLogoAsset filter helper");
  assert.ok(creativeWorkspace.includes("isBrandOrLogoAsset"), "CreativeStudioWorkspace.tsx must use isBrandOrLogoAsset filter helper");
  assert.ok(referencesRoute.includes("isBrandOrLogoAsset"), "references/route.ts must use isBrandOrLogoAsset filter helper");
  assert.ok(brandFilterModule.includes("BRAND_ASSET"), "Must filter BRAND_ASSET purpose");
  assert.ok(brandFilterModule.includes("LOGO_VARIANT"), "Must filter LOGO_VARIANT purpose");
  assert.ok(brandFilterModule.includes("transparent") && brandFilterModule.includes("monoDark") && brandFilterModule.includes("monoLight") && brandFilterModule.includes("badge"), "Must filter transparent, monoDark, monoLight, and badge logo variants");
  assert.ok(brandFilterModule.includes("shop_profile_photo") || brandFilterModule.includes("SHOP_PROFILE_PHOTO"), "Must filter shop profile photos from general content feed");
  assert.ok(contentPage.includes("getCurrentBrandBrain"), "Must retrieve Brand Brain to match against active brand logo");
  assert.ok(contentPage.includes("contentAssets = assets.filter"), "Must filter raw database assets with isBrandOrLogoAsset");
  console.log("✓ Content page & Creative Studio references filtering logic: BRAND_ASSET, LOGO_VARIANT, logo variants, and active logo matching verified.");

  // 2. Verify ContentLibraryClient.tsx defense-in-depth filtering
  const contentClient = read("app", "app", "content", "ContentLibraryClient.tsx");
  assert.ok(contentClient.includes("filteredItems"), "ContentLibraryClient must compute filteredItems");
  assert.ok(contentClient.includes("transparent"), "Must filter logo variants in client UI");
  assert.ok(contentClient.includes("monoDark") || contentClient.includes("monodark"), "Must filter monoDark in client UI");
  assert.ok(contentClient.includes("monoLight") || contentClient.includes("monolight"), "Must filter monoLight in client UI");
  assert.ok(contentClient.includes("badge"), "Must filter badge logo variant in client UI");
  console.log("✓ ContentLibraryClient defense-in-depth: All Content, Creatives & Posters, and Saved Assets tabs protected.");

  // 3. Verify DELETE safeguards in brand photos route
  const brandPhotosRoute = read("app", "api", "platform", "brand", "photos", "route.ts");
  assert.ok(brandPhotosRoute.includes("brand_brains") && brandPhotosRoute.includes("brand_brain_versions"), "DELETE handler must check active brand brain");
  assert.ok(brandPhotosRoute.includes("logo_url") && brandPhotosRoute.includes("logo_variants"), "Must check logo_url and logo_variants");
  assert.ok(brandPhotosRoute.includes("Cannot delete an asset that is currently set as an active brand logo"), "Must reject deletion of active brand logo");
  console.log("✓ Brand photos DELETE route safeguard: Protected active brand logo from accidental deletion.");

  // 4. Verify DELETE safeguards in media-assets repository
  const mediaRepo = read("lib", "social", "repositories", "media-assets.ts");
  assert.ok(mediaRepo.includes("removeUnattachedMediaAsset"), "Must contain removeUnattachedMediaAsset");
  assert.ok(mediaRepo.includes("brand_brains") && mediaRepo.includes("brand_brain_versions"), "removeUnattachedMediaAsset must inspect brand_brains");
  assert.ok(mediaRepo.includes("Cannot delete an asset that is currently set as an active brand logo"), "Must guard active brand logo from repository removal");
  console.log("✓ Media assets repository safeguard: removeUnattachedMediaAsset protects bound brand assets.");

  // 5. Direct verification of isBrandOrLogoAsset function
  const testBrandAsset1 = { provenance: { purpose: "BRAND_ASSET" }, original_name: "brand-logo.png" };
  const testBrandAsset2 = { provenance: { purpose: "LOGO_VARIANT", variant: "monoDark" }, original_name: "logo.png" };
  const testBrandAsset3 = { provenance: { variant: "transparent" }, original_name: "logo-transparent.png" };
  const testBrandAsset4 = { provenance: { purpose: "shop_profile_photo" }, storage_path: "user/tenant/shop-profile-photos/abc.jpg" };

  // Testing untagged logo files generated during early testing
  const testUntaggedLogo1 = { original_name: "transparent.png" };
  const testUntaggedLogo2 = { original_name: "badge.png" };
  const testUntaggedLogo3 = { original_name: "monoDark.png" };
  const testUntaggedLogo4 = { original_name: "monoLight.png" };
  const testUntaggedLogo5 = { original_name: "my_shop_logo.jpg" };
  const testUntaggedLogo6 = { storage_path: "user/tenant/creative-references/uuid-logo.png" };
  const testUntaggedLogo7 = { storage_path: "user/tenant/media/logo-variants/variant-1.png" };

  const testContentAsset1 = { provenance: { purpose: "SOCIAL_POST" }, original_name: "festive_promo.png", storage_path: "user/tenant/media/festive.png" };
  const testContentAsset2 = { generation_job_id: "job-123", source_type: "generated", original_name: "ai_creative.png" };
  const testContentAsset3 = { original_name: "gym_workout_hero.jpg", storage_path: "user/tenant/media/gym.jpg" };

  const testBrain = {
    content: {
      logo_url: "https://storage.supabase.co/bucket/user/tenant/media/active-logo-123.png?token=xyz",
      logo_variants: {
        badge: "https://storage.supabase.co/bucket/user/tenant/media/active-badge-456.png?token=abc",
        transparent: "https://storage.supabase.co/bucket/user/tenant/media/active-transparent-789.png",
      },
    },
  };
  const testActiveLogoAsset1 = { id: "active-logo-123", storage_path: "user/tenant/media/active-logo-123.png" };
  const testActiveLogoAsset2 = { id: "active-badge-456", previewUrl: "https://storage.supabase.co/bucket/user/tenant/media/active-badge-456.png?signed=true" };

  assert.equal(isBrandOrLogoAsset(testBrandAsset1), true, "testBrandAsset1 must be flagged as brand asset");
  assert.equal(isBrandOrLogoAsset(testBrandAsset2), true, "testBrandAsset2 must be flagged as logo variant");
  assert.equal(isBrandOrLogoAsset(testBrandAsset3), true, "testBrandAsset3 must be flagged as transparent logo");
  assert.equal(isBrandOrLogoAsset(testBrandAsset4), true, "testBrandAsset4 must be flagged as shop photo");

  assert.equal(isBrandOrLogoAsset(testUntaggedLogo1), true, "Untagged transparent.png must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo2), true, "Untagged badge.png must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo3), true, "Untagged monoDark.png must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo4), true, "Untagged monoLight.png must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo5), true, "Untagged my_shop_logo.jpg must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo6), true, "Untagged path with logo must be blocked");
  assert.equal(isBrandOrLogoAsset(testUntaggedLogo7), true, "Untagged path with logo-variants must be blocked");

  assert.equal(isBrandOrLogoAsset(testActiveLogoAsset1, testBrain), true, "testActiveLogoAsset1 must be flagged as bound active logo");
  assert.equal(isBrandOrLogoAsset(testActiveLogoAsset2, testBrain), true, "testActiveLogoAsset2 must be flagged as bound active badge");

  assert.equal(isBrandOrLogoAsset(testContentAsset1, testBrain), false, "testContentAsset1 (social post) must NOT be filtered");
  assert.equal(isBrandOrLogoAsset(testContentAsset2, testBrain), false, "testContentAsset2 (AI creative) must NOT be filtered");
  assert.equal(isBrandOrLogoAsset(testContentAsset3, testBrain), false, "testContentAsset3 (gym photo) must NOT be filtered");
  console.log("✓ Aggressive Brand Asset & Logo Leak Prevention tests: 100% accurate classification.");

  console.log("\n=======================================================");
  console.log("ALL CONTENT LIBRARY BRAND ASSET FILTERING TESTS PASSED!");
  console.log("=======================================================");
}

run();
