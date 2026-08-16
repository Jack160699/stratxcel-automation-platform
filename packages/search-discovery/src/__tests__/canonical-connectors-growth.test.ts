import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverGoogleAssets,
  discoverMetaAssets,
  discoverLinkedInAssets,
  registerProviderConnection,
  getProviderConnection,
  updateSelectedAssets,
  disconnectProvider,
  isCapabilityAuthorized,
} from "../../../../lib/connectors/canonical-connector-hub.ts";
import {
  auditGoogleBusinessProfile,
  processCustomerReview,
  createGoogleBusinessProfileRequest,
  getVerificationGuide,
} from "../../../../lib/google/google-growth-engine.ts";
import {
  generateCampaignDraft,
  activateCampaignWithApproval,
  proposeBudgetAdjustment,
} from "../../../../lib/commercial/ads-planning-engine.ts";
import { getUnifiedConnectionHealth } from "../../../../lib/connectors/health-center.ts";

test("Canonical Connector Hub: Google One-Tap Discovery & Multi-Asset Selection", async () => {
  const tenantId = "test-tenant-google-1";
  const discovery = await discoverGoogleAssets("mock-token", {
    identity: { email: "founder@stratxcel.in", name: "StratXcel Founder" },
  });

  assert.equal(discovery.identity.email, "founder@stratxcel.in");
  assert.equal(discovery.ga4Properties.length, 1);
  assert.equal(discovery.searchConsoleSites.length, 1);
  assert.equal(discovery.businessLocations.length, 1);
  assert.equal(discovery.adsAccounts.length, 1);
  assert.equal(discovery.youtubeChannels.length, 1);

  // Register Google connection selecting GA4, GSC, GBP, and YouTube
  const allDiscovered = [
    ...discovery.ga4Properties,
    ...discovery.searchConsoleSites,
    ...discovery.businessLocations,
    ...discovery.adsAccounts,
    ...discovery.youtubeChannels,
  ];

  const selectedIds = ["ga4-1", "gsc-1", "gbp-1", "yt-1"];

  const connection = await registerProviderConnection({
    tenantId,
    provider: "google",
    status: "CONNECTED",
    accountEmailOrName: "founder@stratxcel.in",
    grantedScopes: ["webmasters.readonly", "analytics.readonly", "youtube.upload"],
    tokenHealth: "HEALTHY",
    discoveredAssets: allDiscovered,
    selectedAssetIds: selectedIds,
    activeCapabilities: [],
  });

  assert.equal(connection.status, "CONNECTED");
  assert.equal(connection.selectedAssetIds.length, 4);
  assert.ok(connection.activeCapabilities.includes("READ"));
  assert.ok(connection.activeCapabilities.includes("PUBLISH"));
  assert.ok(connection.activeCapabilities.includes("ANALYTICS"));

  // Check individual capability authorization
  const ga4Auth = await isCapabilityAuthorized(tenantId, "google", "ga4_property", "ANALYTICS");
  assert.equal(ga4Auth.authorized, true);

  const gscAuth = await isCapabilityAuthorized(tenantId, "google", "search_console_site", "READ");
  assert.equal(gscAuth.authorized, true);

  const gbpAuth = await isCapabilityAuthorized(tenantId, "google", "google_business_location", "WRITE");
  assert.equal(gbpAuth.authorized, true);

  // Ads was not selected in selectedIds
  const gadsAuth = await isCapabilityAuthorized(tenantId, "google", "google_ads_account", "SPEND_MANAGED");
  assert.equal(gadsAuth.authorized, false);
});

test("Canonical Connector Hub: Meta One-Tap Discovery & Independent Capabilities", async () => {
  const tenantId = "test-tenant-meta-1";
  const discovery = await discoverMetaAssets("mock-token", {
    identity: { name: "StratXcel Page Admin", userId: "admin-1" },
  });

  assert.equal(discovery.facebookPages.length, 1);
  assert.equal(discovery.instagramProfiles.length, 1);
  assert.equal(discovery.threadsProfiles.length, 1);
  assert.equal(discovery.adsAccounts.length, 1);

  const allAssets = [
    ...discovery.facebookPages,
    ...discovery.instagramProfiles,
    ...discovery.threadsProfiles,
    ...discovery.adsAccounts,
  ];

  // Select FB, IG, Threads
  const connection = await registerProviderConnection({
    tenantId,
    provider: "meta",
    status: "CONNECTED",
    accountEmailOrName: "StratXcel Page Admin",
    grantedScopes: ["pages_manage_posts", "instagram_business_content_publish", "threads_content_publish"],
    tokenHealth: "HEALTHY",
    discoveredAssets: allAssets,
    selectedAssetIds: ["fb-page-1", "ig-prof-1", "th-prof-1"],
    activeCapabilities: [],
  });

  assert.equal(connection.status, "CONNECTED");
  assert.ok(connection.activeCapabilities.includes("PUBLISH"));

  const igAuth = await isCapabilityAuthorized(tenantId, "meta", "instagram_profile", "PUBLISH");
  assert.equal(igAuth.authorized, true);

  const fbAuth = await isCapabilityAuthorized(tenantId, "meta", "facebook_page", "WRITE");
  assert.equal(fbAuth.authorized, true);

  // Disconnect provider
  await disconnectProvider(tenantId, "meta");
  const igAfterDisconnect = await isCapabilityAuthorized(tenantId, "meta", "instagram_profile", "PUBLISH");
  assert.equal(igAfterDisconnect.authorized, false);
});

test("Canonical Connector Hub: LinkedIn One-Tap Discovery & Organization Binding", async () => {
  const tenantId = "test-tenant-li-1";
  const discovery = await discoverLinkedInAssets("mock-token", {
    identity: { name: "StratXcel Org Admin", memberId: "member-10" },
  });

  assert.equal(discovery.companyPages.length, 1);

  await registerProviderConnection({
    tenantId,
    provider: "linkedin",
    status: "CONNECTED",
    accountEmailOrName: "StratXcel Org Admin",
    grantedScopes: ["w_organization_social", "r_organization_social"],
    tokenHealth: "HEALTHY",
    discoveredAssets: discovery.companyPages,
    selectedAssetIds: ["li-org-1"],
    activeCapabilities: [],
  });

  const liAuth = await isCapabilityAuthorized(tenantId, "linkedin", "linkedin_page", "PUBLISH");
  assert.equal(liAuth.authorized, true);
});

test("Google Growth Engine: Existing Business Profile Audit & Review Processing", () => {
  const location = {
    locationId: "loc-1",
    businessName: "Sharma Electronics",
    primaryCategory: "Electronics repair shop",
    address: {
      streetAddress: "Shop 4, Market Road",
      city: "Bhilai",
      state: "Chhattisgarh",
      postalCode: "490006",
      country: "India",
    },
    phone: "9876543210",
    websiteUrl: "https://sharmaelectronics.in",
    description: "Expert mobile, laptop, and television repair services with genuine parts and warranty.",
    photoCount: 6,
    verificationStatus: "VERIFIED" as const,
    reviewCount: 42,
    averageRating: 4.8,
  };

  const audit = auditGoogleBusinessProfile(location);
  assert.equal(audit.completenessScore, 100);
  assert.equal(audit.passedChecks.length, 6);

  // Review Processing: Positive Review
  const positiveReview = {
    reviewerName: "Amit Verma",
    starRating: 5,
    comment: "Excellent fast screen replacement and very polite staff!",
  };
  const posOutcome = processCustomerReview("Sharma Electronics", positiveReview);
  assert.equal(posOutcome.sentiment, "POSITIVE");
  assert.equal(posOutcome.requiresEscalation, false);
  assert.ok(posOutcome.draftResponse.includes("Thank you so much"));

  // Review Processing: Critical Negative Review Escalation
  const negativeReview = {
    reviewerName: "Angry Customer",
    starRating: 1,
    comment: "Total scam! They broke my laptop and cheated me.",
  };
  const negOutcome = processCustomerReview("Sharma Electronics", negativeReview);
  assert.equal(negOutcome.sentiment, "NEGATIVE");
  assert.equal(negOutcome.requiresEscalation, true);
  assert.ok(negOutcome.draftResponse.includes("sincerely apologize"));
});

test("Google Growth Engine: Missing Profile Creation & Verification Experience", () => {
  const creationInput = {
    tenantId: "tenant-new-biz",
    businessName: "Fresh Bakery",
    primaryCategory: "Bakery",
    streetAddress: "12 Main Market",
    city: "Raipur",
    state: "Chhattisgarh",
    postalCode: "492001",
    phone: "9123456789",
    websiteUrl: "https://freshbakery.in",
    description: "Fresh daily artisan bread, custom celebration cakes, and delicious pastries baked daily.",
  };

  const creationResult = createGoogleBusinessProfileRequest(creationInput);
  assert.equal(creationResult.status, "USER_ACTION_REQUIRED");
  assert.equal(creationResult.nextSteps.length, 4);

  // Verification Guide: User Action Required
  const actionGuide = getVerificationGuide("USER_ACTION_REQUIRED", "Fresh Bakery");
  assert.equal(actionGuide.status, "USER_ACTION_REQUIRED");
  assert.equal(actionGuide.automationStatus, "DISABLED_UNTIL_VERIFIED");
  assert.equal(actionGuide.steps.length, 3);
  assert.ok(actionGuide.estimatedReviewTime.includes("business days"));

  // Verification Guide: Once Verified
  const verifiedGuide = getVerificationGuide("VERIFIED", "Fresh Bakery");
  assert.equal(verifiedGuide.status, "VERIFIED");
  assert.equal(verifiedGuide.automationStatus, "ACTIVE");
});

test("Paid Advertising Engine: Campaign Planning & Human Spend Gate", () => {
  const metaDraft = generateCampaignDraft({
    platform: "meta_ads",
    tenantId: "tenant-ads-1",
    businessName: "Aura Salon",
    offering: "Bridal Makeup",
    targetLocations: ["Raipur", "Bhilai"],
    monthlyBudgetRupees: 6000,
  });

  assert.equal(metaDraft.platform, "meta_ads");
  assert.equal(metaDraft.dailyBudgetRupees, 200);
  assert.equal(metaDraft.status, "DRAFT_PENDING_APPROVAL");
  assert.equal(metaDraft.approvalRequired, true);

  // Attempt activation without human approval token -> throws error
  assert.throws(
    () => {
      activateCampaignWithApproval(metaDraft, {
        isApproved: false,
        approvedBy: "",
        approvalToken: "",
      });
    },
    { message: /SPEND_APPROVAL_REQUIRED/ },
  );

  // Activate with explicit human approval token -> succeeds
  const activeCampaign = activateCampaignWithApproval(metaDraft, {
    isApproved: true,
    approvedBy: "owner@aurasalon.in",
    approvalToken: "token_verified_hmac_12345",
  });

  assert.equal(activeCampaign.status, "ACTIVE");
  assert.equal(activeCampaign.approvalRequired, false);
  assert.equal(activeCampaign.approvedBy, "owner@aurasalon.in");

  // Propose Budget Adjustment
  const budgetProposal = proposeBudgetAdjustment(activeCampaign, 300, "Increase during weekend wedding season");
  assert.equal(budgetProposal.status, "REQUIRES_HUMAN_APPROVAL");
  assert.equal(budgetProposal.proposedDailyBudgetRupees, 300);
});

test("Unified Connection Health Center: Status Aggregation", async () => {
  const tenantId = "tenant-health-center-1";

  // Register partial Google and Meta
  await registerProviderConnection({
    tenantId,
    provider: "google",
    status: "CONNECTED",
    accountEmailOrName: "admin@stratxcel.in",
    grantedScopes: ["webmasters.readonly"],
    tokenHealth: "HEALTHY",
    discoveredAssets: [
      {
        id: "ga4-h",
        category: "ga4_property",
        provider: "google",
        name: "StratXcel GA4",
        externalId: "properties/123",
        capabilities: ["READ", "ANALYTICS"],
        isSelected: true,
      },
    ],
    selectedAssetIds: ["ga4-h"],
    activeCapabilities: ["READ", "ANALYTICS"],
  });

  const report = await getUnifiedConnectionHealth(tenantId, { websiteUrl: "https://www.stratxcel.in/" });
  assert.equal(report.tenantId, tenantId);
  assert.ok(report.overallHealthScore > 0);
  assert.equal(report.sections.length, 4); // Google, Meta, WhatsApp, Website

  const googleSec = report.sections.find((s) => s.provider === "google");
  assert.equal(googleSec?.overallStatus, "CONNECTED");

  const gscAsset = googleSec?.assets.find((a) => a.category === "search_console_site");
  assert.equal(gscAsset?.status, "PARTIAL");
  assert.ok(gscAsset?.issue?.action === "Select Asset");
});
