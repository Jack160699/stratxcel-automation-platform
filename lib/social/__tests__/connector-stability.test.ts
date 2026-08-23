import assert from "node:assert/strict";
import { getTenantDigitalPresence, getBusinessConnectionStatus, V1_DIGITAL_PRESENCE_PLATFORMS } from "../../connectors/canonical-status.ts";
import { upsertConnectedAccount } from "../repositories/accounts.ts";
import { provisionTenantConnectorsFromMetadata } from "../provisioning.ts";
import { saveBrandBrainVersion } from "@stratxcel/brand-brain";

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, "a").toString("base64");

console.log("Running StratXcel Digital Presence & Connector Stability Test Suite...\n");

/**
 * In-memory Mock Supabase Service Client simulating production relational tables:
 * - social_accounts & social_tokens
 * - search_google_connections
 * - whatsapp_phone_bindings
 * - brand_brains
 */
function createTestDb() {
  const tables: {
    social_accounts: any[];
    social_tokens: any[];
    search_google_connections: any[];
    whatsapp_phone_bindings: any[];
    brand_brains: any[];
    brand_brain_versions: any[];
    tenant_members: any[];
  } = {
    social_accounts: [],
    social_tokens: [],
    search_google_connections: [],
    whatsapp_phone_bindings: [],
    brand_brains: [],
    brand_brain_versions: [],
    tenant_members: [],
  };

  const client: any = {
    from(tableName: string) {
      const table = (tables as any)[tableName];
      if (!table) throw new Error(`Unhandled table in test DB: ${tableName}`);

      return {
        select(cols = "*") {
          let filterFn: (row: any) => boolean = () => true;
          let sortFn: ((a: any, b: any) => number) | null = null;
          let limitCount: number | null = null;

          const queryObj: any = {
            eq(col: string, val: any) {
              const prev = filterFn;
              filterFn = (r) => prev(r) && r[col] === val;
              return queryObj;
            },
            in(col: string, values: any[]) {
              const prev = filterFn;
              filterFn = (r) => prev(r) && values.includes(r[col]);
              return queryObj;
            },
            order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
              sortFn = (a, b) => {
                if (a[col] < b[col]) return ascending ? -1 : 1;
                if (a[col] > b[col]) return ascending ? 1 : -1;
                return 0;
              };
              return queryObj;
            },
            limit(n: number) {
              limitCount = n;
              return queryObj;
            },
            async maybeSingle() {
              let rows = table.filter(filterFn);
              if (sortFn) rows = rows.sort(sortFn);
              return { data: rows[0] || null, error: null };
            },
            async single() {
              let rows = table.filter(filterFn);
              if (sortFn) rows = rows.sort(sortFn);
              if (rows.length === 0) return { data: null, error: new Error("Row not found") };
              return { data: rows[0], error: null };
            },
            then(resolve: any) {
              let rows = table.filter(filterFn);
              if (sortFn) rows = rows.sort(sortFn);
              if (limitCount !== null) rows = rows.slice(0, limitCount);
              return resolve({ data: rows, error: null });
            },
          };
          return queryObj;
        },

        insert(payload: any) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const inserted = rows.map((r) => ({
            id: r.id || `${tableName}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...r,
          }));
          table.push(...inserted);
          return {
            select() {
              return {
                async single() {
                  return { data: inserted[0], error: null };
                },
                async maybeSingle() {
                  return { data: inserted[0], error: null };
                },
              };
            },
            then(resolve: any) {
              return resolve({ data: inserted, error: null });
            },
          };
        },

        update(patch: any) {
          return {
            eq(col: string, val: any) {
              const matched = table.filter((r: any) => r[col] === val);
              matched.forEach((r: any) => Object.assign(r, patch, { updated_at: new Date().toISOString() }));
              return {
                select() {
                  return {
                    async single() {
                      return { data: matched[0] || null, error: null };
                    },
                    async maybeSingle() {
                      return { data: matched[0] || null, error: null };
                    },
                  };
                },
                then(resolve: any) {
                  return resolve({ data: matched, error: null });
                },
              };
            },
            in(col: string, values: any[]) {
              const matched = table.filter((r: any) => values.includes(r[col]));
              matched.forEach((r: any) => Object.assign(r, patch, { updated_at: new Date().toISOString() }));
              return Promise.resolve({ data: matched, error: null });
            },
          };
        },

        upsert(payload: any, options: { onConflict?: string } = {}) {
          const conflictCols = options.onConflict ? options.onConflict.split(",") : ["id"];
          const existing = table.find((r: any) =>
            conflictCols.every((col) => r[col] === payload[col])
          );

          let resultRow: any;
          if (existing) {
            Object.assign(existing, payload, { updated_at: new Date().toISOString() });
            resultRow = existing;
          } else {
            resultRow = {
              id: payload.id || `${tableName}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...payload,
            };
            table.push(resultRow);
          }

          return {
            select() {
              return {
                async single() {
                  return { data: resultRow, error: null };
                },
                async maybeSingle() {
                  return { data: resultRow, error: null };
                },
              };
            },
            then(resolve: any) {
              return resolve({ data: resultRow, error: null });
            },
          };
        },
      };
    },
  };

  return { client, tables };
}

// -------------------------------------------------------------
// TEST 1: V1.5 Customer Platform Set Invariant (No LinkedIn, X, Threads)
// -------------------------------------------------------------
{
  console.log("Test 1: V1.5 Canonical Platforms Set Invariant...");
  assert.equal(V1_DIGITAL_PRESENCE_PLATFORMS.includes("linkedin" as any), false, "LinkedIn must not be in V1.5 customer set");
  assert.equal(V1_DIGITAL_PRESENCE_PLATFORMS.includes("x" as any), false, "X must not be in V1.5 customer set");
  assert.equal(V1_DIGITAL_PRESENCE_PLATFORMS.includes("threads" as any), false, "Threads must not be in V1.5 customer set");

  const expectedV1 = [
    "website",
    "google_business",
    "instagram",
    "facebook",
    "youtube",
    "google_analytics",
    "google_search_console",
    "whatsapp",
  ];
  assert.deepEqual([...V1_DIGITAL_PRESENCE_PLATFORMS], expectedV1, "V1.5 set must match exactly 8 supported platforms");
  console.log("✓ V1.5 canonical platform set verified.\n");
}

// -------------------------------------------------------------
// TEST 2: Public Discovery vs Authentic OAuth Connection Resolution
// -------------------------------------------------------------
{
  console.log("Test 2: Public Discovery vs Authentic OAuth Connection Resolution...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_test_101";

  // Case A: Website crawler found Instagram URL, but user has NOT done OAuth
  await saveBrandBrainVersion(client, {
    tenantId,
    createdBy: "system",
    content: {
      website_url: "https://www.stratxcel.in",
      channels: ["https://instagram.com/stratxcel_official", "https://facebook.com/stratxcel"],
    },
  });

  const presenceBefore = await getTenantDigitalPresence(client, tenantId);
  const igBefore = presenceBefore.connections.instagram;
  const fbBefore = presenceBefore.connections.facebook;
  const ytBefore = presenceBefore.connections.youtube;

  assert.equal(igBefore.connectionState, "DISCOVERED_PUBLICLY", "Instagram must be DISCOVERED_PUBLICLY when only public link exists");
  assert.equal(igBefore.isDiscoveredPublicly, true);
  assert.equal(igBefore.publicUrl, "https://instagram.com/stratxcel_official");
  assert.equal(fbBefore.connectionState, "DISCOVERED_PUBLICLY");
  assert.equal(ytBefore.connectionState, "NOT_CONNECTED");

  // Case B: User completes real OAuth for Instagram -> database record created
  await upsertConnectedAccount(client, {
    ownerId: "user_owner_1",
    tenantId,
    platform: "instagram",
    providerAccountId: "ig_meta_987654321",
    username: "@stratxcel_official",
    displayName: "StratXcel Official",
    permissions: ["instagram_business_basic", "instagram_business_content_publish"],
    accessToken: "valid_meta_long_lived_token",
    expiresInSeconds: 5184000,
  });

  // Re-read status from ground truth
  const presenceAfter = await getTenantDigitalPresence(client, tenantId);
  const igAfter = presenceAfter.connections.instagram;

  assert.equal(igAfter.connectionState, "CONNECTED", "STATE 3 (CONNECTED) must strictly override public discovery!");
  assert.equal(igAfter.isDiscoveredPublicly, false, "isDiscoveredPublicly must be false when authentic OAuth exists");
  assert.equal(igAfter.authState, "AUTHENTICATED");
  assert.equal(igAfter.healthState, "HEALTHY");
  assert.equal(igAfter.externalAccountId, "ig_meta_987654321");
  assert.equal(igAfter.handle, "@stratxcel_official");

  // Facebook is still only discovered publicly
  assert.equal(presenceAfter.connections.facebook.connectionState, "DISCOVERED_PUBLICLY");

  console.log("✓ Public discovery cleanly distinguished from authentic OAuth connections.\n");
}

// -------------------------------------------------------------
// TEST 3: Full Lifecycle: Connect -> Callback -> Persist -> Reload -> Disconnect -> Reconnect
// -------------------------------------------------------------
{
  console.log("Test 3: Full Connector Lifecycle (Connect -> Persist -> Reload -> Disconnect -> Reconnect)...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_test_lifecycle";
  const ownerId = "user_test_lifecycle";

  // Step 1: Initial empty state
  let status = await getBusinessConnectionStatus(client, tenantId, "facebook");
  assert.equal(status.connectionState, "NOT_CONNECTED");

  // Step 2: Connect Facebook Page
  await upsertConnectedAccount(client, {
    ownerId,
    tenantId,
    platform: "facebook",
    providerAccountId: "page_fb_12345",
    username: "StratXcel India",
    displayName: "StratXcel India Facebook Page",
    permissions: ["pages_show_list", "pages_manage_posts"],
    accessToken: "fb_page_access_token_encrypted",
    expiresInSeconds: 5184000,
  });

  // Step 3: Reload from server ground truth
  status = await getBusinessConnectionStatus(client, tenantId, "facebook");
  assert.equal(status.connectionState, "CONNECTED");
  assert.equal(status.displayName, "StratXcel India Facebook Page");
  assert.equal(status.externalAccountId, "page_fb_12345");

  // Step 4: Disconnect Facebook Page
  const accountRow = tables.social_accounts.find((r) => r.tenant_id === tenantId && r.platform === "facebook");
  assert.ok(accountRow, "Social account row must exist");
  accountRow.status = "DISCONNECTED";
  accountRow.token_health = "REVOKED";

  // Clear tokens
  const tokenRow = tables.social_tokens.find((r) => r.account_id === accountRow.id);
  if (tokenRow) {
    tokenRow.access_token_encrypted = "";
    tokenRow.refresh_token_encrypted = null;
  }

  // Check reloaded status after disconnect
  status = await getBusinessConnectionStatus(client, tenantId, "facebook");
  assert.equal(status.connectionState, "NOT_CONNECTED", "Status must become NOT_CONNECTED after disconnect");

  // Step 5: Reconnect Facebook Page (updates existing tenant record, no duplicate row)
  await upsertConnectedAccount(client, {
    ownerId,
    tenantId,
    platform: "facebook",
    providerAccountId: "page_fb_12345",
    username: "StratXcel India Renewed",
    displayName: "StratXcel India Renewed",
    permissions: ["pages_show_list", "pages_manage_posts"],
    accessToken: "fb_page_access_token_new",
    expiresInSeconds: 5184000,
  });

  const fbAccounts = tables.social_accounts.filter((r) => r.tenant_id === tenantId && r.platform === "facebook");
  assert.equal(fbAccounts.length, 1, "Must update existing row rather than creating duplicate accounts");
  assert.equal(fbAccounts[0].status, "CONNECTED");
  assert.equal(fbAccounts[0].display_name, "StratXcel India Renewed");

  status = await getBusinessConnectionStatus(client, tenantId, "facebook");
  assert.equal(status.connectionState, "CONNECTED");
  assert.equal(status.displayName, "StratXcel India Renewed");

  console.log("✓ Connect -> Callback -> Persist -> Reload -> Disconnect -> Reconnect verified.\n");
}

// -------------------------------------------------------------
// TEST 4: Google Analytics (GA4) & Search Console Property Association & Persistence
// -------------------------------------------------------------
{
  console.log("Test 4: Google Search Console & GA4 Persistence...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_google_integration";

  // Step 1: User connects Google OAuth (search_google_connections row created)
  tables.search_google_connections.push({
    tenant_id: tenantId,
    status: "connected",
    encrypted_refresh_token_ref: "vault_ref_123",
    granted_scopes: ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly"],
    search_console_site_url: null,
    ga4_property_id: null,
    ga4_property_display_name: null,
  });

  // Check status before property selection
  let presence = await getTenantDigitalPresence(client, tenantId);
  assert.equal(presence.connections.google_analytics.connectionState, "CONNECTED");
  assert.equal(presence.connections.google_search_console.connectionState, "CONNECTED");

  // Step 2: User selects Search Console site and GA4 property
  const gConn = tables.search_google_connections.find((r) => r.tenant_id === tenantId);
  gConn.search_console_site_url = "https://www.stratxcel.in";
  gConn.ga4_property_id = "345678901";
  gConn.ga4_property_display_name = "StratXcel Production Website";
  gConn.ga4_last_synced_at = new Date().toISOString();

  // Reload status
  presence = await getTenantDigitalPresence(client, tenantId);
  const ga4 = presence.connections.google_analytics;
  const sc = presence.connections.google_search_console;

  assert.equal(ga4.connectionState, "CONNECTED");
  assert.equal(ga4.handle, "345678901");
  assert.equal(ga4.displayName, "StratXcel Production Website");
  assert.equal(ga4.healthState, "HEALTHY");

  assert.equal(sc.connectionState, "CONNECTED");
  assert.equal(sc.handle, "https://www.stratxcel.in");
  assert.equal(sc.publicUrl, "https://www.stratxcel.in");

  console.log("✓ Google Search Console & GA4 property persistence verified.\n");
}

// -------------------------------------------------------------
// TEST 4b: Google Search Console & GA4 -- "connected" status with no
// usable stored token must report REAUTH_REQUIRED, not CONNECTED
// -------------------------------------------------------------
{
  console.log("Test 4b: Google Search Console & GA4 -- connected row without a usable token...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_google_no_token";

  // Regression for a P1 finding from live E2E testing on 2026-08-23: this
  // is the exact real-world row shape every tenant's search_google_
  // connections was left in before the OAuth callback's token-persistence
  // bug was fixed (status: "connected", but no refresh token was ever
  // stored). Confirmed live: canonical status here reported CONNECTED
  // while /api/platform/search/google/resources -- which actually tries
  // to mint a live access token -- correctly reported disconnected,
  // producing a direct customer-visible contradiction (Connected Accounts
  // page said NOT CONNECTED right below a sidebar badge and a Home
  // dashboard both saying Google was live).
  tables.search_google_connections.push({
    tenant_id: tenantId,
    status: "connected",
    encrypted_refresh_token_ref: null,
    granted_scopes: [],
    search_console_site_url: "https://www.stratxcel.in",
    ga4_property_id: "111222333",
    ga4_property_display_name: "StratXcel",
  });

  const presence = await getTenantDigitalPresence(client, tenantId);
  const ga4 = presence.connections.google_analytics;
  const sc = presence.connections.google_search_console;

  assert.equal(ga4.connectionState, "REAUTH_REQUIRED", "GA4 with status=connected but no usable token must not report CONNECTED");
  assert.equal(ga4.reauthRequired, true);
  assert.equal(sc.connectionState, "REAUTH_REQUIRED", "Search Console with status=connected but no usable token must not report CONNECTED");
  assert.equal(sc.reauthRequired, true);

  console.log("✓ Connected-but-tokenless Google rows correctly report REAUTH_REQUIRED, not a false CONNECTED.\n");
}

// -------------------------------------------------------------
// TEST 5: Strict Multi-Tenant Isolation
// -------------------------------------------------------------
{
  console.log("Test 5: Multi-Tenant Connection Isolation...");
  const { client, tables } = createTestDb();

  // Tenant Alpha connects YouTube
  await upsertConnectedAccount(client, {
    ownerId: "user_alpha",
    tenantId: "tenant_alpha",
    platform: "youtube",
    providerAccountId: "yt_channel_alpha",
    username: "StratXcel Alpha Channel",
    displayName: "StratXcel Alpha Channel",
    permissions: ["youtube.upload"],
    accessToken: "token_alpha",
  });

  // Tenant Beta connects YouTube
  await upsertConnectedAccount(client, {
    ownerId: "user_beta",
    tenantId: "tenant_beta",
    platform: "youtube",
    providerAccountId: "yt_channel_beta",
    username: "StratXcel Beta Channel",
    displayName: "StratXcel Beta Channel",
    permissions: ["youtube.upload"],
    accessToken: "token_beta",
  });

  const alphaStatus = await getBusinessConnectionStatus(client, "tenant_alpha", "youtube");
  const betaStatus = await getBusinessConnectionStatus(client, "tenant_beta", "youtube");
  const gammaStatus = await getBusinessConnectionStatus(client, "tenant_gamma", "youtube");

  assert.equal(alphaStatus.connectionState, "CONNECTED");
  assert.equal(alphaStatus.displayName, "StratXcel Alpha Channel");

  assert.equal(betaStatus.connectionState, "CONNECTED");
  assert.equal(betaStatus.displayName, "StratXcel Beta Channel");

  assert.equal(gammaStatus.connectionState, "NOT_CONNECTED");

  console.log("✓ Multi-tenant connection isolation verified.\n");
}

// -------------------------------------------------------------
// TEST 6: WhatsApp Verified Phone Number Rehydration
// -------------------------------------------------------------
{
  console.log("Test 6: WhatsApp Verified Phone Binding...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_wa_test";

  tables.whatsapp_phone_bindings.push({
    tenant_id: tenantId,
    display_phone_number: "+919876543210",
    phone_number_id: "+919876543210",
    status: "active",
    verified_at: new Date().toISOString(),
  });

  const waStatus = await getBusinessConnectionStatus(client, tenantId, "whatsapp");
  assert.equal(waStatus.connectionState, "CONNECTED");
  assert.equal(waStatus.handle, "+919876543210");
  assert.equal(waStatus.displayName, "+919876543210");
  assert.equal(waStatus.healthState, "HEALTHY");

  console.log("✓ WhatsApp phone binding rehydration verified.\n");
}

// -------------------------------------------------------------
// TEST 7: REAUTH_REQUIRED detection uses the real social_accounts enum values
// -------------------------------------------------------------
// Regression test: social_accounts_status_check only allows CONNECTED |
// DISCONNECTED | ERROR | RECONNECT_REQUIRED, and
// social_accounts_token_health_check only allows UNKNOWN | HEALTHY |
// EXPIRING | EXPIRED | REVOKED | ERROR (verified against the live schema).
// The canonical resolver used to check status.includes("REAUTH") and
// token_health === "INVALID" -- neither value is legal under either
// constraint, so REAUTH_REQUIRED was unreachable dead code for every social
// provider until lib/social/repositories/accounts.ts markReauthRequired was
// corrected to write the real values (RECONNECT_REQUIRED / EXPIRED).
{
  console.log("Test 7: REAUTH_REQUIRED detection matches the real persisted enum values...");
  const { client, tables } = createTestDb();
  const tenantId = "tenant_reauth_test";

  // A row exactly as markReauthRequired() now writes it.
  tables.social_accounts.push({
    id: "acct_reauth_1",
    tenant_id: tenantId,
    owner_id: "owner_reauth_1",
    platform: "instagram",
    provider_account_id: "ig_1",
    username: "reauth_business",
    display_name: "Reauth Business",
    status: "RECONNECT_REQUIRED",
    token_health: "EXPIRED",
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let status = await getBusinessConnectionStatus(client, tenantId, "instagram");
  assert.equal(status.connectionState, "REAUTH_REQUIRED", "status=RECONNECT_REQUIRED must resolve to REAUTH_REQUIRED");
  assert.equal(status.reauthRequired, true);
  assert.equal(status.healthState, "DEGRADED");

  // A REVOKED token on an account still marked CONNECTED must also surface
  // as REAUTH_REQUIRED (the provider silently invalidated it server-side).
  tables.social_accounts.push({
    id: "acct_reauth_2",
    tenant_id: tenantId,
    owner_id: "owner_reauth_2",
    platform: "facebook",
    provider_account_id: "fb_1",
    username: "reauth_page",
    display_name: "Reauth Page",
    status: "CONNECTED",
    token_health: "REVOKED",
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  status = await getBusinessConnectionStatus(client, tenantId, "facebook");
  assert.equal(status.connectionState, "REAUTH_REQUIRED", "a REVOKED token_health must also surface as REAUTH_REQUIRED");

  // A deliberate customer DISCONNECTED must never read as REAUTH_REQUIRED,
  // even if a leftover token_health value (recorded at disconnect time)
  // would otherwise match -- disconnect is terminal, not broken.
  tables.social_accounts.push({
    id: "acct_reauth_3",
    tenant_id: tenantId,
    owner_id: "owner_reauth_3",
    platform: "youtube",
    provider_account_id: "yt_1",
    username: "reauth_channel",
    display_name: "Reauth Channel",
    status: "DISCONNECTED",
    token_health: "REVOKED",
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  status = await getBusinessConnectionStatus(client, tenantId, "youtube");
  assert.equal(status.connectionState, "NOT_CONNECTED", "an explicit DISCONNECTED status must win over a leftover token_health value");
  assert.equal(status.reauthRequired, false);

  console.log("✓ REAUTH_REQUIRED is reachable via the real enum values, and disconnect still takes precedence.\n");
}

console.log("===============================================================");
console.log("ALL DIGITAL PRESENCE & CONNECTOR STABILITY TESTS PASSED (7/7)!");
console.log("===============================================================\n");
