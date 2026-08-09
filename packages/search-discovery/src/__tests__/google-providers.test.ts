// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/google-providers.test.ts
import assert from "node:assert/strict";
import { createGoogleSearchConsoleProvider, listSearchConsoleSites } from "../google/search-console-provider.ts";
import { createGoogleAnalyticsProvider, listGa4Properties } from "../google/analytics-provider.ts";
import { ProviderUnavailableError } from "../providers.ts";
import { createFakeGoogleConnectionsDb, createFakeVault, installFetchMock, jsonResponse } from "./google-test-helpers.ts";

async function run() {
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = "cid";
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET = "csecret";

  // ===== Search Console: property listing mapping =====
  {
    const mock = installFetchMock([
      {
        match: (url) => url === "https://www.googleapis.com/webmasters/v3/sites",
        respond: () =>
          jsonResponse({
            siteEntry: [
              { siteUrl: "https://owned.example/", permissionLevel: "siteOwner" },
              { siteUrl: "https://unverified.example/", permissionLevel: "siteUnverifiedUser" },
              { siteUrl: "sc-domain:owned2.example", permissionLevel: "siteFullUser" },
            ],
          }),
      },
    ]);
    try {
      const sites = await listSearchConsoleSites("token");
      assert.equal(sites.length, 2, "an unverified-access site must not be listed as selectable");
      assert.ok(sites.some((s) => s.siteUrl === "https://owned.example/"));
      assert.ok(sites.some((s) => s.siteUrl === "sc-domain:owned2.example"));
      assert.equal(sites.some((s) => s.permissionLevel === "siteUnverifiedUser"), false);
    } finally {
      mock.restore();
    }
  }

  // ===== Search Console: permission failure classification =====
  {
    const mock = installFetchMock([{ match: (url) => url.includes("/sites"), respond: () => new Response("forbidden", { status: 403 }) }]);
    try {
      await assert.rejects(() => listSearchConsoleSites("token"), (err: unknown) => {
        assert.ok(err instanceof ProviderUnavailableError);
        assert.equal((err as ProviderUnavailableError).state, "permission_required");
        return true;
      });
    } finally {
      mock.restore();
    }
  }

  // ===== Search Console: connection states derived from stored config =====
  {
    const db = createFakeGoogleConnectionsDb([]);
    const vault = createFakeVault();
    const provider = createGoogleSearchConsoleProvider({ db, vault, tenantId: "tenant-a" });
    assert.equal((await provider.connection()).state, "not_connected");
  }
  {
    const db = createFakeGoogleConnectionsDb([{ tenant_id: "tenant-a", status: "connected", search_console_site_url: null }]);
    const vault = createFakeVault();
    const provider = createGoogleSearchConsoleProvider({ db, vault, tenantId: "tenant-a" });
    assert.equal((await provider.connection()).state, "configuration_required");
  }
  {
    const db = createFakeGoogleConnectionsDb([{ tenant_id: "tenant-a", status: "connected", search_console_site_url: "https://owned.example/", search_console_last_synced_at: "2026-08-01T00:00:00Z" }]);
    const vault = createFakeVault();
    const provider = createGoogleSearchConsoleProvider({ db, vault, tenantId: "tenant-a" });
    const conn = await provider.connection();
    assert.equal(conn.state, "connected");
    assert.equal(conn.lastSuccessfulSyncAt, "2026-08-01T00:00:00Z");
  }

  // ===== Search Console: readSnapshot mapping + row bounds + tenant mismatch =====
  {
    const db = createFakeGoogleConnectionsDb([
      { tenant_id: "tenant-a", status: "connected", search_console_site_url: "https://owned.example/", encrypted_refresh_token_ref: "ref-1" },
    ]);
    const vault = createFakeVault({ "ref-1": "refresh-token-a" });
    const provider = createGoogleSearchConsoleProvider({ db, vault, tenantId: "tenant-a" });

    await assert.rejects(() => provider.readSnapshot("tenant-b", "https://owned.example/"), ProviderUnavailableError, "reading with a foreign tenantId must be rejected, never silently served");

    let capturedBody: any;
    const mock = installFetchMock([
      { match: (url) => url === "https://oauth2.googleapis.com/token", respond: () => jsonResponse({ access_token: "at-1", expires_in: 3599 }) },
      {
        match: (url) => url.includes("/searchAnalytics/query"),
        respond: (_url, init) => {
          capturedBody = JSON.parse(String(init?.body));
          return jsonResponse({
            rows: [
              { keys: ["dentist near me", "/dentist"], clicks: 10, impressions: 1000, ctr: 0.01, position: 8.2 },
              { keys: ["dental implants"], clicks: 2, impressions: 50, ctr: 0.04, position: 15 },
            ],
          });
        },
      },
    ]);
    try {
      const snapshot = await provider.readSnapshot("tenant-a", "https://owned.example/");
      assert.equal(snapshot.rows.length, 2);
      assert.equal(snapshot.rows[0].query, "dentist near me");
      assert.equal(snapshot.rows[0].page, "/dentist");
      assert.equal(snapshot.rows[0].clicks, 10);
      assert.equal(snapshot.rows[0].impressions, 1000);
      assert.equal(snapshot.rows[1].page, undefined, "a row with only one dimension key must not fabricate a page value");
      assert.ok(snapshot.periodStart < snapshot.periodEnd);
      assert.equal(capturedBody.rowLimit, 1000);
      assert.ok(capturedBody.rowLimit <= 25000, "rowLimit must stay within the documented API ceiling");
      assert.deepEqual(capturedBody.dimensions, ["query", "page"]);
    } finally {
      mock.restore();
    }
  }

  // ===== GA4: property listing mapping =====
  {
    const mock = installFetchMock([
      {
        match: (url) => url.includes("/accountSummaries"),
        respond: () =>
          jsonResponse({
            accountSummaries: [
              {
                displayName: "Acme Inc",
                propertySummaries: [
                  { property: "properties/111", displayName: "Acme Website" },
                  { property: "properties/222", displayName: "Acme App" },
                ],
              },
            ],
          }),
      },
    ]);
    try {
      const properties = await listGa4Properties("token");
      assert.equal(properties.length, 2);
      assert.equal(properties[0].propertyId, "111", "the properties/ prefix must be stripped");
      assert.equal(properties[0].accountDisplayName, "Acme Inc");
    } finally {
      mock.restore();
    }
  }

  // ===== GA4: permission failure classification =====
  {
    const mock = installFetchMock([{ match: (url) => url.includes("/accountSummaries"), respond: () => new Response("no", { status: 401 }) }]);
    try {
      await assert.rejects(() => listGa4Properties("token"), (err: unknown) => {
        assert.ok(err instanceof ProviderUnavailableError);
        assert.equal((err as ProviderUnavailableError).state, "permission_required");
        return true;
      });
    } finally {
      mock.restore();
    }
  }

  // ===== GA4: runReport mapping, organic filtering, missing metrics =====
  {
    const db = createFakeGoogleConnectionsDb([
      { tenant_id: "tenant-a", status: "connected", ga4_property_id: "111", encrypted_refresh_token_ref: "ref-2" },
    ]);
    const vault = createFakeVault({ "ref-2": "refresh-token-ga4" });
    const provider = createGoogleAnalyticsProvider({ db, vault, tenantId: "tenant-a" });

    let capturedBody: any;
    const mock = installFetchMock([
      { match: (url) => url === "https://oauth2.googleapis.com/token", respond: () => jsonResponse({ access_token: "at-2", expires_in: 3599 }) },
      {
        match: (url) => url.includes(":runReport"),
        respond: (_url, init) => {
          capturedBody = JSON.parse(String(init?.body));
          return jsonResponse({
            rows: [
              { dimensionValues: [{ value: "/landing-a" }], metricValues: [{ value: "120" }, { value: "80" }, { value: "5" }] },
              // Malformed/short row — missing the keyEvents metric entirely.
              { dimensionValues: [{ value: "/landing-b" }], metricValues: [{ value: "30" }, { value: "10" }] },
            ],
          });
        },
      },
    ]);
    try {
      const snapshot = await provider.readOutcomes("tenant-a", "https://owned.example/");
      assert.equal(snapshot.landingPages.length, 2);
      assert.equal(snapshot.landingPages[0].url, "/landing-a");
      assert.equal(snapshot.landingPages[0].organicVisits, 120);
      assert.equal(snapshot.landingPages[0].engagedSessions, 80);
      assert.equal(snapshot.landingPages[0].conversions, 5);
      assert.equal(snapshot.landingPages[1].conversions, undefined, "a metric GA4 did not return must surface as undefined, never a fabricated 0");
      assert.equal(snapshot.landingPages[0].formSubmissions, undefined, "unmeasured fields must never be invented");
      assert.equal(snapshot.landingPages[0].attributedLeads, undefined);

      // Organic-search isolation via the current GA4 channel-grouping dimension.
      assert.equal(capturedBody.dimensionFilter.filter.fieldName, "sessionDefaultChannelGroup");
      assert.equal(capturedBody.dimensionFilter.filter.stringFilter.value, "Organic Search");
      // Current (post key-events-rename) metric API name, not the deprecated one.
      assert.ok(capturedBody.metrics.some((m: any) => m.name === "keyEvents"));
      assert.equal(capturedBody.metrics.some((m: any) => m.name === "conversions"), false);
    } finally {
      mock.restore();
    }

    // Tenant mismatch must be rejected, never silently served.
    await assert.rejects(() => provider.readOutcomes("tenant-b", "https://owned.example/"), ProviderUnavailableError);
  }

  // ===== GA4: configuration_required when connected but no property selected =====
  {
    const db = createFakeGoogleConnectionsDb([{ tenant_id: "tenant-a", status: "connected", ga4_property_id: null }]);
    const vault = createFakeVault();
    const provider = createGoogleAnalyticsProvider({ db, vault, tenantId: "tenant-a" });
    assert.equal((await provider.connection()).state, "configuration_required");
    await assert.rejects(() => provider.readOutcomes("tenant-a", "https://owned.example/"), (err: unknown) => {
      assert.ok(err instanceof ProviderUnavailableError);
      assert.equal((err as ProviderUnavailableError).state, "configuration_required");
      return true;
    });
  }

  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;

  console.log("google-providers.test.ts: ALL PASS (GSC + GA4 mapping, bounds, permission failures, organic filter, missing metrics, tenant mismatch, connection states)");
}

run();
