import assert from "node:assert/strict";
import {
  googleBusinessProvider,
  isResolvedGbpLocationResourceName,
  getCanonicalGbpLocationResourceName,
  matchGoogleBusinessLocation,
  discoverAllGoogleBusinessLocations,
  normalizeGoogleVerificationState,
  getAccountVerificationState,
  searchGoogleLocations,
  claimGoogleLocation,
  type GbpAccount,
  type GbpLocation,
} from "../providers/google-business.ts";
import { getTenantDigitalPresence } from "../../connectors/canonical-status.ts";
import { loadIntegrationsStatusData } from "../../connectors/load-integrations-data.ts";

process.env.GOOGLE_BUSINESS_CLIENT_ID = process.env.GOOGLE_BUSINESS_CLIENT_ID || "test-google-business-client-id";
process.env.GOOGLE_BUSINESS_CLIENT_SECRET = process.env.GOOGLE_BUSINESS_CLIENT_SECRET || "test-google-business-client-secret";

async function run() {
  console.log("Starting Google Business Profile Connection Integrity Test Suite...\n");

  // --- 1. Resource Name Validation & Normalization --------------------------
  assert.equal(isResolvedGbpLocationResourceName("accounts/123/locations/456"), true);
  assert.equal(isResolvedGbpLocationResourceName("locations/456"), true);
  assert.equal(isResolvedGbpLocationResourceName("118157607743139723110"), false);
  assert.equal(isResolvedGbpLocationResourceName("accounts/123"), false);
  assert.equal(isResolvedGbpLocationResourceName(""), false);

  assert.equal(
    getCanonicalGbpLocationResourceName("accounts/101", "locations/202"),
    "accounts/101/locations/202"
  );
  assert.equal(
    getCanonicalGbpLocationResourceName(undefined, "accounts/101/locations/202"),
    "accounts/101/locations/202"
  );
  assert.equal(
    getCanonicalGbpLocationResourceName(undefined, "locations/202"),
    "locations/202"
  );
  console.log("✓ Test 1: Resource name validation and canonical normalization verified");

  // --- 2. Multi-Signal Location Matching ------------------------------------
  const mockLocations: GbpLocation[] = [
    {
      name: "locations/other-1",
      title: "Other Business",
      websiteUri: "https://www.otherdomain.com",
      accountName: "accounts/acc-1",
    },
    {
      name: "locations/stratxcel-loc",
      title: "StratXcel Automation Agency",
      websiteUri: "https://www.stratxcel.in",
      storefrontAddress: {
        addressLines: ["Level 4, High-Tech Tower"],
        locality: "Bangalore",
        regionCode: "IN",
      },
      accountName: "accounts/acc-2",
      permissionLevel: "OWNER_ACCESS",
    },
  ];

  // Match by website URI
  const matchByWebsite = matchGoogleBusinessLocation(mockLocations, {
    websiteUrl: "https://www.stratxcel.in",
    brandName: "Different Name",
  });
  assert.equal(matchByWebsite.matchConfidence, "HIGH");
  assert.equal(matchByWebsite.matchedLocation?.name, "locations/stratxcel-loc");
  assert.ok(matchByWebsite.reason.includes("Matched by website domain"));

  // Match by brand name
  const matchByBrand = matchGoogleBusinessLocation(
    [
      { name: "locations/brand-loc", title: "StratXcel", accountName: "accounts/acc-1" },
      { name: "locations/other-loc", title: "Random Business", accountName: "accounts/acc-1" },
    ],
    { websiteUrl: "https://no-match-site.com", brandName: "StratXcel" }
  );
  assert.equal(matchByBrand.matchConfidence, "MEDIUM");
  assert.equal(matchByBrand.matchedLocation?.name, "locations/brand-loc");

  // Single location auto-match
  const singleMatch = matchGoogleBusinessLocation(
    [{ name: "locations/sole-loc", title: "My Only Business", accountName: "accounts/acc-1" }],
    { websiteUrl: "https://unrelated.com", brandName: "Something Else" }
  );
  assert.equal(singleMatch.matchConfidence, "SINGLE_LOCATION");
  assert.equal(singleMatch.matchedLocation?.name, "locations/sole-loc");

  // Zero locations
  const zeroMatch = matchGoogleBusinessLocation([], {
    websiteUrl: "https://www.stratxcel.in",
    brandName: "StratXcel",
  });
  assert.equal(zeroMatch.matchConfidence, "NONE");
  assert.equal(zeroMatch.matchedLocation, null);
  console.log("✓ Test 2: Multi-signal location matching algorithm verified");

  // --- 3. Discovery across multiple accounts --------------------------------
  const mockFetch = (async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("mybusinessaccountmanagement")) {
      return {
        ok: true,
        json: async () => ({
          accounts: [
            { name: "accounts/personal-1", accountName: "Personal Account", role: "PRIMARY_OWNER" },
            { name: "accounts/org-2", accountName: "StratXcel Org", role: "OWNER" },
          ],
        }),
      } as Response;
    }
    if (urlStr.includes("accounts/personal-1/locations")) {
      return {
        ok: true,
        json: async () => ({ locations: [] }), // Empty personal account
      } as Response;
    }
    if (urlStr.includes("accounts/org-2/locations")) {
      return {
        ok: true,
        json: async () => ({
          locations: [
            {
              name: "locations/stratxcel-org-loc",
              title: "StratXcel",
              websiteUri: "https://www.stratxcel.in",
            },
          ],
        }),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  }) as typeof fetch;

  const discovery = await discoverAllGoogleBusinessLocations("mock_token", mockFetch);
  assert.equal(discovery.accounts.length, 2);
  assert.equal(discovery.locations.length, 1);
  assert.equal(discovery.locations[0].name, "locations/stratxcel-org-loc");
  assert.equal(discovery.locations[0].accountName, "accounts/org-2");
  console.log("✓ Test 3: Multi-account discovery iterates through all accounts");

  // --- 4. Canonical Status Resolution (Resolved vs Setup Required) ----------
  const makeMockDb = (socialAccountRow: any) => ({
    from: (table: string) => {
      const getRows = () => (table === "social_accounts" && socialAccountRow ? [socialAccountRow] : []);
      const getTokens = () => (socialAccountRow ? [{ account_id: socialAccountRow.id, access_token_encrypted: "enc-token" }] : []);

      const queryBuilder: any = {
        select: () => queryBuilder,
        eq: () => queryBuilder,
        order: () => queryBuilder,
        in: () => queryBuilder,
        maybeSingle: () => Promise.resolve({ data: table === "social_accounts" ? socialAccountRow : null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        limit: () => Promise.resolve({ data: getRows(), error: null }),
        then: (onfulfilled: any, onrejected: any) => {
          const res = {
            data: table === "social_tokens" ? getTokens() : getRows(),
            error: null,
          };
          return Promise.resolve(res).then(onfulfilled, onrejected);
        },
      };
      return queryBuilder;
    },
  });

  // Case A: Authenticated & Location Resolved
  const resolvedDb = makeMockDb({
    id: "test-acc-id",
    tenant_id: "tenant-resolved",
    platform: "google_business",
    provider_account_id: "accounts/acc-1/locations/loc-1",
    display_name: "StratXcel",
    username: "StratXcel",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: {
      location_resolved: true,
      business_title: "StratXcel",
      business_address: "Bangalore, IN",
      permission_level: "OWNER_ACCESS",
    },
  });

  const presenceResolved = await getTenantDigitalPresence(resolvedDb as any, "tenant-resolved");
  assert.equal(presenceResolved.connections.google_business.connectionState, "CONNECTED");
  assert.equal(presenceResolved.connections.google_business.authState, "AUTHENTICATED");
  assert.equal(presenceResolved.connections.google_business.healthState, "HEALTHY");
  assert.equal(presenceResolved.connections.google_business.reauthRequired, false);
  assert.equal(presenceResolved.connections.google_business.displayName, "StratXcel");

  const uiStatusResolved = await loadIntegrationsStatusData(resolvedDb as any, "tenant-resolved", "owner");
  assert.equal(uiStatusResolved.google, "connected");
  assert.equal(uiStatusResolved.google_business_details?.locationResolved, true);
  assert.equal(uiStatusResolved.google_business_details?.locationSetupRequired, false);
  assert.equal(uiStatusResolved.google_business_details?.businessTitle, "StratXcel");

  // Case B: Authenticated but Location Setup Required (Truthful handling - NOT generic needs attention)
  const setupRequiredDb = makeMockDb({
    id: "test-acc-id",
    tenant_id: "tenant-setup",
    platform: "google_business",
    provider_account_id: "118157607743139723110", // Bare Google user ID fallback
    display_name: "Shriyansh Chandrakar",
    username: "shriyansh@example.com",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: {
      location_resolved: false,
      google_email: "shriyansh@example.com",
      discovery_status: "NO_GBP_ACCOUNTS_FOUND",
    },
  });

  const presenceSetup = await getTenantDigitalPresence(setupRequiredDb as any, "tenant-setup");
  assert.equal(presenceSetup.connections.google_business.connectionState, "CONNECTED");
  assert.equal(presenceSetup.connections.google_business.authState, "AUTHENTICATED");
  assert.equal(presenceSetup.connections.google_business.healthState, "HEALTHY");
  assert.equal(presenceSetup.connections.google_business.reauthRequired, false); // DOES NOT loop into reauth!
  assert.ok(presenceSetup.connections.google_business.error?.includes("Business Profile location was not found"));

  const uiStatusSetup = await loadIntegrationsStatusData(setupRequiredDb as any, "tenant-setup", "owner");
  assert.equal(uiStatusSetup.google, "connected");
  assert.equal(uiStatusSetup.google_business_details?.locationResolved, false);
  assert.equal(uiStatusSetup.google_business_details?.locationSetupRequired, true);
  assert.equal(uiStatusSetup.google_business_details?.googleEmail, "shriyansh@example.com");
  // Real discovery outcome (brief Section 29) must actually reach the UI
  // layer, not just sit captured in metadata.
  assert.equal(uiStatusSetup.google_business_details?.discoveryStatus, "NO_GBP_ACCOUNTS_FOUND");

  console.log("✓ Test 4: Canonical status resolution accurately separates resolved from setup-required states");

  // --- 5. Google's real account.verificationState -- captured, never ----
  // --- fabricated, distinct from OAuth/location success (STRATXCEL — -----
  // --- GOOGLE BUSINESS AUTONOMOUS SETUP brief, Section 9/38) --------------
  assert.equal(normalizeGoogleVerificationState("VERIFIED"), "VERIFIED");
  assert.equal(normalizeGoogleVerificationState("UNVERIFIED"), "UNVERIFIED");
  assert.equal(normalizeGoogleVerificationState("VERIFICATION_REQUESTED"), "PENDING");
  assert.equal(normalizeGoogleVerificationState("VERIFICATION_STATE_UNSPECIFIED"), "UNKNOWN", "Google's own explicit unspecified sentinel must never read as verified");
  assert.equal(normalizeGoogleVerificationState(undefined), "UNKNOWN", "a missing value must never be assumed verified");
  assert.equal(normalizeGoogleVerificationState(null), "UNKNOWN");
  assert.equal(normalizeGoogleVerificationState("something_unrecognized"), "UNKNOWN", "an unrecognized value must fail closed");

  const verifiedFetch = (async (url: string) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "tok_v", expires_in: 3600 }) } as Response;
    if (u.includes("oauth2/v2/userinfo")) return { ok: true, json: async () => ({ id: "1", email: "owner@example.com" }) } as Response;
    if (u.includes("mybusinessaccountmanagement.googleapis.com/v1/accounts") && !u.includes("accounts/")) {
      return { ok: true, json: async () => ({ accounts: [{ name: "accounts/org-2", accountName: "StratXcel Org", verificationState: "VERIFIED" }] }) } as Response;
    }
    if (u.includes("accounts/org-2/locations")) {
      return { ok: true, json: async () => ({ locations: [{ name: "locations/stratxcel-org-loc", title: "StratXcel", websiteUri: "https://www.stratxcel.in" }] }) } as Response;
    }
    return { ok: false, status: 404 } as Response;
  }) as typeof fetch;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = verifiedFetch;
    const verifiedResult = await googleBusinessProvider.exchangeCodeForToken("code_v", "https://www.stratxcel.in/api/social/oauth/google_business/callback");
    assert.equal((verifiedResult.metadata as Record<string, unknown>)?.google_verification_state, "VERIFIED", "a real VERIFIED account.verificationState must reach the stored metadata, not be discarded");

    // Zero accounts: must never fabricate a verification value.
    globalThis.fetch = (async (url: string) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "tok_z", expires_in: 3600 }) } as Response;
      if (u.includes("oauth2/v2/userinfo")) return { ok: true, json: async () => ({ id: "2" }) } as Response;
      if (u.includes("mybusinessaccountmanagement.googleapis.com/v1/accounts")) return { ok: true, json: async () => ({ accounts: [] }) } as Response;
      return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const zeroResult = await googleBusinessProvider.exchangeCodeForToken("code_z", "https://www.stratxcel.in/api/social/oauth/google_business/callback");
    assert.equal((zeroResult.metadata as Record<string, unknown>)?.google_verification_state, null, "zero accessible accounts must never fabricate a verification state");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("✓ Test 5: exchangeCodeForToken captures Google's real verificationState honestly");

  // --- 6. getAccountVerificationState -- the real accounts.get call used --
  // --- by the automatic recheck (brief Sections 11/20). --------------------
  try {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = String(url);
      return { ok: true, json: async () => ({ verificationState: "VERIFIED" }) } as Response;
    }) as typeof fetch;
    const state = await getAccountVerificationState("access_tok", "accounts/org-2");
    assert.equal(capturedUrl, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts/org-2");
    assert.equal(state, "VERIFIED");

    globalThis.fetch = (async () => ({ ok: false, status: 401, text: async () => "unauthorized" })) as unknown as typeof fetch;
    await assert.rejects(() => getAccountVerificationState("bad_tok", "accounts/org-2"), /Google Business account lookup failed \(401\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("✓ Test 6: getAccountVerificationState calls the real accounts.get endpoint and throws honestly on failure");

  // --- 7. Canonical status: verification is additive, never overrides -----
  // --- the CONNECTED state, and is only computed once a location has ------
  // --- actually resolved (brief Section 19: never force a reconnect just --
  // --- because verification is pending). -----------------------------------
  const unverifiedDb = makeMockDb({
    id: "test-acc-unverified",
    tenant_id: "tenant-unverified",
    platform: "google_business",
    provider_account_id: "accounts/acc-1/locations/loc-1",
    display_name: "StratXcel",
    username: "StratXcel",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: { location_resolved: true, business_title: "StratXcel", google_verification_state: "UNVERIFIED" },
  });
  const presenceUnverified = await getTenantDigitalPresence(unverifiedDb as any, "tenant-unverified");
  assert.equal(presenceUnverified.connections.google_business.connectionState, "CONNECTED", "pending verification must never force a reconnect state");
  assert.equal(presenceUnverified.connections.google_business.verificationState, "UNVERIFIED");
  assert.equal(presenceUnverified.connections.google_business.verificationRequired, true);
  assert.equal(presenceUnverified.connections.google_business.verificationPending, false);
  assert.match(presenceUnverified.connections.google_business.verificationMessage ?? "", /verification/i);

  const uiUnverified = await loadIntegrationsStatusData(unverifiedDb as any, "tenant-unverified", "owner");
  assert.equal(uiUnverified.google, "connected", "ConnectorState stays connected -- verification is a companion field, not a new enum value");
  assert.equal(uiUnverified.google_business_details?.verificationRequired, true);

  const pendingDb = makeMockDb({
    id: "test-acc-pending",
    tenant_id: "tenant-pending",
    platform: "google_business",
    provider_account_id: "accounts/acc-2/locations/loc-2",
    display_name: "StratXcel",
    username: "StratXcel",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: { location_resolved: true, business_title: "StratXcel", google_verification_state: "VERIFICATION_REQUESTED" },
  });
  const presencePending = await getTenantDigitalPresence(pendingDb as any, "tenant-pending");
  assert.equal(presencePending.connections.google_business.verificationState, "PENDING");
  assert.equal(presencePending.connections.google_business.verificationRequired, false, "an already-submitted verification is pending, not an unstarted action item");
  assert.equal(presencePending.connections.google_business.verificationPending, true);

  const verifiedGbpDb = makeMockDb({
    id: "test-acc-verified",
    tenant_id: "tenant-verified-gbp",
    platform: "google_business",
    provider_account_id: "accounts/acc-3/locations/loc-3",
    display_name: "StratXcel",
    username: "StratXcel",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: { location_resolved: true, business_title: "StratXcel", google_verification_state: "VERIFIED" },
  });
  const presenceVerifiedGbp = await getTenantDigitalPresence(verifiedGbpDb as any, "tenant-verified-gbp");
  assert.equal(presenceVerifiedGbp.connections.google_business.verificationState, "VERIFIED");
  assert.equal(presenceVerifiedGbp.connections.google_business.verificationRequired, false);
  assert.equal(presenceVerifiedGbp.connections.google_business.verificationMessage, null, "a genuinely verified profile must carry no verification advisory");

  // Location NOT resolved: verification must not even be computed (Test B's
  // setupRequiredDb fixture from Test 4, reused here for the same assertion).
  const presenceSetupReused = await getTenantDigitalPresence(setupRequiredDb as any, "tenant-setup");
  assert.equal(presenceSetupReused.connections.google_business.verificationState, undefined, "verification is not a meaningful question before the location itself resolves");
  assert.equal(presenceSetupReused.connections.google_business.verificationRequired, false);

  console.log("✓ Test 7: canonical-status verification surfacing is additive, precedence-correct, and location-gated");

  // --- 8. Real discovery outcome (accounts exist with locations, but ------
  // --- none matched) must be distinguishable from the zero-accounts case --
  // --- all the way through to the UI layer (brief Section 29). ------------
  const locationSelectionDb = makeMockDb({
    id: "test-acc-selection",
    tenant_id: "tenant-selection",
    platform: "google_business",
    provider_account_id: "999888777",
    display_name: "Owner",
    username: "owner4@example.com",
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: { location_resolved: false, discovery_status: "LOCATION_SELECTION_REQUIRED", accounts_count: 1, locations_count: 3 },
  });
  const uiStatusSelection = await loadIntegrationsStatusData(locationSelectionDb as any, "tenant-selection", "owner");
  assert.equal(uiStatusSelection.google_business_details?.discoveryStatus, "LOCATION_SELECTION_REQUIRED");
  assert.equal(uiStatusSelection.google_business_details?.locationsCount, 3);
  assert.notEqual(
    uiStatusSelection.google_business_details?.discoveryStatus,
    uiStatusSetup.google_business_details?.discoveryStatus,
    "zero-accounts and locations-found-but-unmatched must remain distinguishable, never collapsed into the same discoveryStatus"
  );
  console.log("✓ Test 8: LOCATION_SELECTION_REQUIRED reaches the UI layer distinctly from NO_GBP_ACCOUNTS_FOUND");

  // --- 9. searchGoogleLocations / claimGoogleLocation -- real, live-------
  // --- verified endpoints (STRATXCEL — AUTONOMOUS BUSINESS PROFILE brief, --
  // --- Section 11/12/57: "this is not permission to stop" once normal ------
  // --- account/location discovery finds nothing). --------------------------
  {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = (async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({
          googleLocations: [
            {
              name: "googleLocations/abc123",
              location: { title: "StratXcel", websiteUri: "https://www.stratxcel.in" },
              requestAdminRightsUri: "https://business.google.com/request-access/abc123",
            },
          ],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const results = await searchGoogleLocations("tok", { title: "StratXcel", websiteUri: "https://www.stratxcel.in" }, mockFetch);
    assert.equal(fetchCalls[0].url, "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search");
    assert.equal(fetchCalls[0].init?.method, "POST");
    const sentBody = JSON.parse(String(fetchCalls[0].init?.body));
    assert.equal(sentBody.location.title, "StratXcel");
    assert.equal(sentBody.location.websiteUri, "https://www.stratxcel.in");
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "googleLocations/abc123");
    assert.equal(results[0].requestAdminRightsUri, "https://business.google.com/request-access/abc123", "an already-claimed match must surface Google's own real request-access URL");

    // Genuinely unclaimed match: no requestAdminRightsUri.
    const unclaimedFetch = (async () => ({
      ok: true,
      json: async () => ({ googleLocations: [{ name: "googleLocations/xyz", location: { title: "StratXcel" } }] }),
    })) as unknown as typeof fetch;
    const unclaimedResults = await searchGoogleLocations("tok", { title: "StratXcel" }, unclaimedFetch);
    assert.equal(unclaimedResults[0].requestAdminRightsUri, null, "a genuinely unclaimed listing must never have a fabricated requestAdminRightsUri");

    // Zero matches: never fabricates a result.
    const noMatchFetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    assert.deepEqual(await searchGoogleLocations("tok", { title: "Nonexistent Business" }, noMatchFetch), []);

    // Honest failure, never a fabricated empty success.
    const failFetch = (async () => ({ ok: false, status: 403, text: async () => "forbidden" })) as unknown as typeof fetch;
    await assert.rejects(() => searchGoogleLocations("tok", { title: "StratXcel" }, failFetch), /Google location search failed \(403\)/);

    // claimGoogleLocation: reuses Google's own returned location verbatim, never a fabricated payload.
    let claimUrl = "";
    let claimBody: unknown;
    const claimFetch = (async (url: string, init?: RequestInit) => {
      claimUrl = String(url);
      claimBody = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ name: "accounts/999/locations/888" }) } as Response;
    }) as unknown as typeof fetch;
    const realLocation: GbpLocation = { name: "googleLocations/xyz", title: "StratXcel", websiteUri: "https://www.stratxcel.in" };
    const claimed = await claimGoogleLocation("tok", "accounts/999", realLocation, "req-1", claimFetch);
    assert.equal(claimUrl, "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/999/locations?requestId=req-1");
    assert.deepEqual(claimBody, realLocation, "must resubmit the exact location Google returned, never a modified/fabricated one");
    assert.equal(claimed.name, "accounts/999/locations/888");

    const claimFailFetch = (async () => ({ ok: false, status: 409, text: async () => "already exists" })) as unknown as typeof fetch;
    await assert.rejects(() => claimGoogleLocation("tok", "accounts/999", realLocation, "req-2", claimFailFetch), /Google Business location claim failed \(409\)/);
  }
  console.log("✓ Test 9: searchGoogleLocations/claimGoogleLocation call the real endpoints, never fabricate a match or claim result");

  console.log("\n============================================================");
  console.log("ALL GOOGLE BUSINESS CONNECTION INTEGRITY TESTS PASSED!");
  console.log("============================================================\n");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
