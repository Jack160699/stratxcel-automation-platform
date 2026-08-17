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
          select(_cols: string) {
            return {
              eq(col1: string, val1: any) {
                return {
                  eq(col2: string, val2: any) {
                    return {
                      async maybeSingle() {
                        const found = socialAccounts.find((r) => r[col1] === val1 && r[col2] === val2);
                        return { data: found || null, error: null };
                      },
                    };
                  },
                };
              },
            };
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
  assert.deepEqual(summary.socialAccountsProvisioned.sort(), ["instagram", "youtube"], "Social accounts provisioned");
  assert.equal(summary.googleConnectionsProvisioned, true, "Google connection provisioned");

  assert.equal(whatsappBindings.length, 1);
  assert.equal(whatsappBindings[0].tenant_id, "tenant_alpha");
  assert.equal(whatsappBindings[0].display_phone_number, "+919876543210");
  assert.equal(whatsappBindings[0].status, "active");

  assert.equal(socialAccounts.length, 2);
  assert.equal(socialAccounts.find((s) => s.platform === "instagram")?.status, "CONNECTED");
  assert.equal(socialAccounts.find((s) => s.platform === "youtube")?.status, "CONNECTED");

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
  assert.equal(socialAccounts[0].status, "CONNECTED");

  console.log("✓ Test 3: Existing user auto-reconciliation verified");
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
