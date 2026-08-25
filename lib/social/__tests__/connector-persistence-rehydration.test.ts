import assert from "node:assert/strict";
import { provisionTenantConnectorsFromMetadata } from "../provisioning.ts";
import { buildPresenceLinks } from "../../audit/v1/presence.ts";

console.log("Running StratXcel Connector Persistence & Tenant Rehydration Test Suite...\n");

// Fake in-memory Supabase client simulating tables with unique constraints
function createFakeDb() {
  const whatsappBindings: any[] = [];
  const socialAccounts: any[] = [];
  const googleConnections: any[] = [];

  const fakeClient: any = {
    from(table: string) {
      if (table === "whatsapp_phone_bindings") {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: any) {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          async maybeSingle() {
                            const found = whatsappBindings.find((r) => r[col] === val);
                            return { data: found || null, error: null };
                          },
                        };
                      },
                    };
                  },
                  async maybeSingle() {
                    const found = whatsappBindings.find((r) => r[col] === val);
                    return { data: found || null, error: null };
                  },
                };
              },
            };
          },
          insert(payload: any) {
            whatsappBindings.push({ ...payload, id: `wa_${Date.now()}_${Math.random()}` });
            return Promise.resolve({ data: payload, error: null });
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const target = whatsappBindings.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
        };
      }

      if (table === "social_accounts") {
        return {
          // A chainable filter builder supporting .eq()/.is() in any order
          // and any count, matching real supabase-js query semantics --
          // provisioning.ts filters by .is("tenant_id", null).eq("owner_id",
          // ...).eq("platform", ...) to find a pre-tenant, owner-scoped row
          // left behind by an OAuth connection made before the tenant
          // existed (see lib/social/provisioning.ts). A fixed two-.eq()
          // chain silently broke ("...is is not a function") the moment
          // that real filter shape was introduced, without the real
          // production logic (which uses the real supabase-js client) ever
          // being wrong -- only this mock was stale.
          select(_cols: string) {
            const filters: Array<[string, any]> = [];
            const chain: any = {
              eq(col: string, val: any) {
                filters.push([col, val]);
                return chain;
              },
              is(col: string, val: any) {
                filters.push([col, val]);
                return chain;
              },
              async maybeSingle() {
                const found = socialAccounts.find((r) => filters.every(([col, val]) => r[col] === val));
                return { data: found || null, error: null };
              },
            };
            return chain;
          },
          insert(payload: any) {
            socialAccounts.push({ ...payload, id: `soc_${Date.now()}_${Math.random()}` });
            return Promise.resolve({ data: payload, error: null });
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const target = socialAccounts.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
          upsert(payload: any) {
            const existing = socialAccounts.find(
              (r) => r.owner_id === payload.owner_id && r.platform === payload.platform && r.provider_account_id === payload.provider_account_id
            );
            if (existing) {
              Object.assign(existing, payload);
            } else {
              socialAccounts.push({ ...payload, id: `soc_${Date.now()}_${Math.random()}` });
            }
            return {
              select() {
                return {
                  async single() {
                    return { data: payload, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "search_google_connections") {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: any) {
                return {
                  async maybeSingle() {
                    const found = googleConnections.find((r) => r[col] === val);
                    return { data: found || null, error: null };
                  },
                };
              },
            };
          },
          upsert(payload: any) {
            const existing = googleConnections.find((r) => r.tenant_id === payload.tenant_id);
            if (existing) {
              Object.assign(existing, payload);
            } else {
              googleConnections.push({ ...payload, id: `g_${Date.now()}_${Math.random()}` });
            }
            return Promise.resolve({ data: payload, error: null });
          },
        };
      }

      throw new Error(`Unhandled table in fake DB: ${table}`);
    },
  };

  return { fakeClient, whatsappBindings, socialAccounts, googleConnections };
}

// Test 1: New onboarding user provisioning
{
  const { fakeClient, whatsappBindings, socialAccounts, googleConnections } = createFakeDb();

  const userMetadata = {
    onboarding_oauth_connections: {
      whatsapp: {
        provider: "whatsapp",
        providerAccountId: "+919876543210",
        username: "+919876543210",
        status: "connected",
      },
      instagram: {
        provider: "instagram",
        providerAccountId: "ig_12345",
        username: "@stratxcel",
        displayName: "StratXcel Official",
        scopes: ["instagram_basic", "instagram_content_publish"],
        status: "connected",
      },
      youtube: {
        provider: "youtube",
        providerAccountId: "yt_67890",
        username: "StratXcel Growth",
        displayName: "StratXcel Growth",
        scopes: ["youtube.upload", "youtube.readonly"],
        status: "connected",
      },
      google_business: {
        provider: "google_business",
        providerAccountId: "gb_11111",
        status: "connected",
      },
    },
  };

  const summary = await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_alpha",
    userId: "user_alpha",
    userMetadata,
  });

  assert.equal(summary.whatsappProvisioned, true, "WhatsApp binding was provisioned");
  // google_business must land in social_accounts, not just search_google_connections --
  // the canonical resolver (lib/connectors/canonical-status.ts's
  // getTenantDigitalPresence) reads Google Business's CONNECTED state from
  // social_accounts (findSocialRow("google_business")) exclusively.
  // Leaving it out here meant every onboarding-time Google Business
  // connection was permanently stuck showing NOT_CONNECTED even after a
  // real, successful OAuth grant.
  assert.deepEqual(summary.socialAccountsProvisioned.sort(), ["google_business", "instagram", "youtube"], "Social accounts provisioned");
  assert.equal(summary.googleConnectionsProvisioned, true, "Google connection provisioned");

  assert.equal(whatsappBindings.length, 1);
  assert.equal(whatsappBindings[0].tenant_id, "tenant_alpha");
  assert.equal(whatsappBindings[0].display_phone_number, "+919876543210");
  assert.equal(whatsappBindings[0].status, "active");

  assert.equal(socialAccounts.length, 3);
  // A fresh row created from metadata alone (no pre-tenant owner-scoped row
  // carrying a real token to link) has no verified token behind it --
  // provisioning.ts now honestly marks it RECONNECT_REQUIRED/UNKNOWN rather
  // than fabricating CONNECTED/HEALTHY (see its own comment above the
  // insert). This assertion used to expect the fabricated "CONNECTED",
  // which stopped matching the moment that honesty fix landed.
  assert.equal(socialAccounts.find((s) => s.platform === "instagram")?.status, "RECONNECT_REQUIRED");
  assert.equal(socialAccounts.find((s) => s.platform === "youtube")?.status, "RECONNECT_REQUIRED");
  assert.equal(socialAccounts.find((s) => s.platform === "google_business")?.status, "RECONNECT_REQUIRED");

  assert.equal(googleConnections.length, 1);
  assert.equal(googleConnections[0].tenant_id, "tenant_alpha");
  assert.equal(googleConnections[0].status, "connected");

  console.log("✓ Test 1: New onboarding user connector provisioning verified");
}

// Test 2: Idempotency (running provisioning multiple times does not duplicate records)
{
  const { fakeClient, whatsappBindings, socialAccounts, googleConnections } = createFakeDb();

  const userMetadata = {
    onboarding_oauth_connections: {
      whatsapp: { provider: "whatsapp", providerAccountId: "+919876543210", status: "connected" },
      instagram: { provider: "instagram", providerAccountId: "ig_12345", username: "@stratxcel", status: "connected" },
    },
  };

  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_alpha",
    userId: "user_alpha",
    userMetadata,
  });

  // Run a second time simulating reload or retried onboarding
  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_alpha",
    userId: "user_alpha",
    userMetadata,
  });

  assert.equal(whatsappBindings.length, 1, "No duplicate WhatsApp bindings");
  assert.equal(socialAccounts.length, 1, "No duplicate social accounts");
  console.log("✓ Test 2: Provisioning idempotency verified");
}

// Test 3: Existing user auto-reconciliation
{
  const { fakeClient, whatsappBindings, socialAccounts } = createFakeDb();

  // User has metadata but relational tenant tables are empty (prior to fix)
  assert.equal(whatsappBindings.length, 0);
  assert.equal(socialAccounts.length, 0);

  const existingUserMetadata = {
    onboarding_whatsapp_verification: {
      phone: "+919876543210",
      verifiedAt: new Date().toISOString(),
    },
    onboarding_oauth_connections: {
      facebook: {
        provider: "facebook",
        providerAccountId: "fb_9999",
        username: "StratXcel Page",
        status: "connected",
      },
    },
  };

  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_beta",
    userId: "user_beta",
    userMetadata: existingUserMetadata,
  });

  assert.equal(whatsappBindings.length, 1);
  assert.equal(whatsappBindings[0].tenant_id, "tenant_beta");
  assert.equal(whatsappBindings[0].status, "active");

  assert.equal(socialAccounts.length, 1);
  assert.equal(socialAccounts[0].platform, "facebook");
  // Same honesty fix as Test 1: a fresh row from metadata alone has no
  // verified token, so it's RECONNECT_REQUIRED, not a fabricated CONNECTED.
  assert.equal(socialAccounts[0].status, "RECONNECT_REQUIRED");

  console.log("✓ Test 3: Existing user auto-reconciliation verified");
}

// Test 3b: A real, token-bearing pre-tenant row gets re-pointed, not
// duplicated -- this is the actual mechanism the "fabricated CONNECTED with
// no real token" fix (see provisioning.ts's comment above the
// ownerScopedAccount lookup) depends on: a customer who connects Google
// Business during pre-workspace onboarding gets a real owner-scoped
// social_accounts row (tenant_id: null) with a real social_tokens row
// behind it, persisted directly by the OAuth callback. When the tenant is
// created moments later, provisioning must find and re-point THAT row
// (carrying its real token along) rather than creating a second, fresh,
// tokenless row next to it -- which is exactly the bug that stranded every
// pre-tenant connection with no path to a usable token.
{
  const { fakeClient, socialAccounts } = createFakeDb();

  socialAccounts.push({
    id: "soc_pretenant_1",
    owner_id: "user_gamma",
    tenant_id: null,
    platform: "google_business",
    provider_account_id: "accounts/real-gbp-account-id",
    username: "owner@example.com",
    display_name: "Owner Name",
    permissions: ["https://www.googleapis.com/auth/business.manage"],
    status: "CONNECTED",
    token_health: "HEALTHY",
  });

  const userMetadata = {
    onboarding_oauth_connections: {
      google_business: {
        provider: "google_business",
        providerAccountId: "accounts/real-gbp-account-id",
        username: "owner@example.com",
        displayName: "Owner Name",
        status: "connected",
      },
    },
  };

  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_gamma",
    userId: "user_gamma",
    userMetadata,
  });

  assert.equal(socialAccounts.length, 1, "Must re-point the existing owner-scoped row, not create a duplicate");
  assert.equal(socialAccounts[0].id, "soc_pretenant_1", "Must be the same row, not a new one");
  assert.equal(socialAccounts[0].tenant_id, "tenant_gamma", "Row must now be linked to the real tenant");
  // Status/token_health are untouched by the re-point -- the real,
  // previously-verified CONNECTED/HEALTHY state (and its social_tokens row,
  // linked by this same account id in production) survives the migration.
  assert.equal(socialAccounts[0].status, "CONNECTED", "A real pre-tenant connection must not be downgraded on re-point");
  assert.equal(socialAccounts[0].token_health, "HEALTHY");

  console.log("✓ Test 3b: Real pre-tenant token-bearing row re-pointed, not duplicated");
}

// Test 4: Presence parsing includes verified_social_links deterministically
{
  const brandContent = {
    website_url: "https://www.stratxcel.in",
    online_profiles: ["https://instagram.com/stratxcel_official"],
    verified_social_links: [
      { platform: "youtube", url: "https://youtube.com/@stratxcel", handle: "@stratxcel" },
      { platform: "facebook", url: "https://facebook.com/stratxcel", handle: "stratxcel" },
    ],
  };

  const rawProfiles = [
    ...(Array.isArray(brandContent.online_profiles) ? brandContent.online_profiles : []),
    ...(Array.isArray(brandContent.verified_social_links)
      ? brandContent.verified_social_links.map((s) => s.url || s.handle)
      : []),
  ];

  const onlineProfiles = [...new Set(rawProfiles.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
  const presence = buildPresenceLinks({
    websiteUrl: brandContent.website_url,
    onlineProfiles,
  });

  assert.ok(presence.some((p) => p.key === "instagram"), "Instagram present in presence");
  assert.ok(presence.some((p) => p.key === "youtube"), "YouTube present in presence from verified_social_links");
  assert.ok(presence.some((p) => p.key === "facebook"), "Facebook present in presence from verified_social_links");

  console.log("✓ Test 4: Presence rendering with verified_social_links verified");
}

// Test 5: Strict Tenant Isolation (Tenant A connectors are never provisioned into Tenant B)
{
  const { fakeClient, whatsappBindings, socialAccounts } = createFakeDb();

  const userA_Meta = {
    onboarding_oauth_connections: {
      whatsapp: { provider: "whatsapp", providerAccountId: "+911111111111", status: "connected" },
      instagram: { provider: "instagram", providerAccountId: "ig_tenant_A", username: "@userA", status: "connected" },
    },
  };

  const userB_Meta = {
    onboarding_oauth_connections: {
      whatsapp: { provider: "whatsapp", providerAccountId: "+912222222222", status: "connected" },
      instagram: { provider: "instagram", providerAccountId: "ig_tenant_B", username: "@userB", status: "connected" },
    },
  };

  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_A",
    userId: "user_A",
    userMetadata: userA_Meta,
  });

  await provisionTenantConnectorsFromMetadata(fakeClient, {
    tenantId: "tenant_B",
    userId: "user_B",
    userMetadata: userB_Meta,
  });

  const tenantA_WA = whatsappBindings.filter((w) => w.tenant_id === "tenant_A");
  const tenantB_WA = whatsappBindings.filter((w) => w.tenant_id === "tenant_B");
  assert.equal(tenantA_WA.length, 1);
  assert.equal(tenantA_WA[0].display_phone_number, "+911111111111");
  assert.equal(tenantB_WA.length, 1);
  assert.equal(tenantB_WA[0].display_phone_number, "+912222222222");

  const tenantA_IG = socialAccounts.filter((s) => s.tenant_id === "tenant_A");
  const tenantB_IG = socialAccounts.filter((s) => s.tenant_id === "tenant_B");
  assert.equal(tenantA_IG[0].username, "@userA");
  assert.equal(tenantB_IG[0].username, "@userB");

  console.log("✓ Test 5: Multi-tenant isolation verified");
}

console.log("\n========================================================");
console.log("ALL CONNECTOR PERSISTENCE & REHYDRATION TESTS PASSED!");
console.log("========================================================\n");
