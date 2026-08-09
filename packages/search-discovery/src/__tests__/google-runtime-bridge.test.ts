// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/google-runtime-bridge.test.ts
import assert from "node:assert/strict";
import { resolveGoogleProviderStates } from "../google/runtime-bridge.ts";
import { saveMeasurementSnapshot } from "../repository.ts";
import { createFakeGoogleConnectionsDb, createFakeVault, installFetchMock, jsonResponse } from "./google-test-helpers.ts";

async function run() {
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = "cid";
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET = "csecret";

  const tokenHandler = { match: (url: string) => url === "https://oauth2.googleapis.com/token", respond: () => jsonResponse({ access_token: "at", expires_in: 3599 }) };
  const gscOkHandler = {
    match: (url: string) => url.includes("/searchAnalytics/query"),
    respond: () => jsonResponse({ rows: [{ keys: ["shoes"], clicks: 4, impressions: 40, ctr: 0.1, position: 3 }] }),
  };
  const ga4OkHandler = {
    match: (url: string) => url.includes(":runReport"),
    respond: () => jsonResponse({ rows: [{ dimensionValues: [{ value: "/shoes" }], metricValues: [{ value: "50" }, { value: "40" }, { value: "1" }] }] }),
  };

  // ===== neither connected: no network calls at all, both entries present and not_connected =====
  {
    const db = createFakeGoogleConnectionsDb([]);
    const vault = createFakeVault();
    const mock = installFetchMock([
      { match: () => true, respond: () => { throw new Error("no Google API call should happen when there is no connection"); } },
    ]);
    try {
      const resolved = await resolveGoogleProviderStates({ db, vault, tenantId: "tenant-a" });
      assert.equal(resolved.connections.length, 2);
      assert.ok(resolved.connections.every((c) => c.state === "not_connected"));
      assert.deepEqual(resolved.snapshots, {});
    } finally {
      mock.restore();
    }
  }

  // ===== GSC success + GA4 success: both independently read and saved =====
  {
    const db = createFakeGoogleConnectionsDb([
      {
        tenant_id: "tenant-a",
        status: "connected",
        encrypted_refresh_token_ref: "ref-a",
        search_console_site_url: "https://owned.example/",
        ga4_property_id: "111",
      },
    ]);
    const vault = createFakeVault({ "ref-a": "refresh-a" });
    const mock = installFetchMock([tokenHandler, gscOkHandler, ga4OkHandler]);
    try {
      const resolved = await resolveGoogleProviderStates({ db, vault, tenantId: "tenant-a" });
      const gsc = resolved.connections.find((c) => c.provider === "search_console");
      const ga4 = resolved.connections.find((c) => c.provider === "ga4");
      assert.equal(gsc?.state, "connected");
      assert.equal(ga4?.state, "connected");
      assert.ok(resolved.snapshots.search_console, "a real GSC snapshot must be present");
      assert.ok(resolved.snapshots.ga4, "a real GA4 snapshot must be present");
      assert.equal((resolved.snapshots.search_console!.values as any).rows[0].query, "shoes");
      assert.equal((resolved.snapshots.ga4!.values as any).landingPages[0].organicVisits, 50);
      assert.match(resolved.snapshots.ga4!.periodStart ?? "", /^\d{4}-\d{2}-\d{2}$/);
      assert.match(resolved.snapshots.ga4!.periodEnd ?? "", /^\d{4}-\d{2}-\d{2}$/);
      assert.ok((resolved.snapshots.ga4!.periodStart ?? "") < (resolved.snapshots.ga4!.periodEnd ?? ""));
      // Sync timestamps must actually be persisted, independently per provider.
      const row = db.rows()[0];
      assert.ok(row.search_console_last_synced_at);
      assert.ok(row.ga4_last_synced_at);
    } finally {
      mock.restore();
    }
  }

  // ===== GSC failure + GA4 success: GA4's real finding must survive GSC's failure =====
  {
    const db = createFakeGoogleConnectionsDb([
      {
        tenant_id: "tenant-a",
        status: "connected",
        encrypted_refresh_token_ref: "ref-a",
        search_console_site_url: "https://owned.example/",
        ga4_property_id: "111",
      },
    ]);
    const vault = createFakeVault({ "ref-a": "refresh-a" });
    const gscFailHandler = { match: (url: string) => url.includes("/searchAnalytics/query"), respond: () => new Response("forbidden", { status: 403 }) };
    const mock = installFetchMock([tokenHandler, gscFailHandler, ga4OkHandler]);
    try {
      const resolved = await resolveGoogleProviderStates({ db, vault, tenantId: "tenant-a" });
      const gsc = resolved.connections.find((c) => c.provider === "search_console");
      const ga4 = resolved.connections.find((c) => c.provider === "ga4");
      assert.equal(gsc?.state, "permission_required", "a truthful failure state, not a silent fallback to connected");
      assert.equal(ga4?.state, "connected");
      assert.equal(resolved.snapshots.search_console, undefined, "no fabricated GSC snapshot on failure");
      assert.ok(resolved.snapshots.ga4, "GA4's independent success must not be erased by GSC's failure");
    } finally {
      mock.restore();
    }
  }

  // ===== GSC success + GA4 failure: the inverse must also hold =====
  {
    const db = createFakeGoogleConnectionsDb([
      {
        tenant_id: "tenant-a",
        status: "connected",
        encrypted_refresh_token_ref: "ref-a",
        search_console_site_url: "https://owned.example/",
        ga4_property_id: "111",
      },
    ]);
    const vault = createFakeVault({ "ref-a": "refresh-a" });
    const ga4FailHandler = { match: (url: string) => url.includes(":runReport"), respond: () => new Response("no", { status: 401 }) };
    const mock = installFetchMock([tokenHandler, gscOkHandler, ga4FailHandler]);
    try {
      const resolved = await resolveGoogleProviderStates({ db, vault, tenantId: "tenant-a" });
      const gsc = resolved.connections.find((c) => c.provider === "search_console");
      const ga4 = resolved.connections.find((c) => c.provider === "ga4");
      assert.equal(gsc?.state, "connected");
      assert.equal(ga4?.state, "permission_required");
      assert.ok(resolved.snapshots.search_console, "GSC's independent success must not be erased by GA4's failure");
      assert.equal(resolved.snapshots.ga4, undefined);
    } finally {
      mock.restore();
    }
  }

  // ===== tenant isolation: tenant A's resolve must never see or use tenant B's connection =====
  {
    const db = createFakeGoogleConnectionsDb([
      { tenant_id: "tenant-a", status: "disconnected" },
      {
        tenant_id: "tenant-b",
        status: "connected",
        encrypted_refresh_token_ref: "ref-b",
        search_console_site_url: "https://tenant-b-only.example/",
        ga4_property_id: "999",
      },
    ]);
    const vault = createFakeVault({ "ref-b": "refresh-b" });
    const mock = installFetchMock([
      { match: () => true, respond: () => { throw new Error("tenant A's resolve must never call Google using tenant B's connection"); } },
    ]);
    try {
      const resolved = await resolveGoogleProviderStates({ db, vault, tenantId: "tenant-a" });
      assert.ok(resolved.connections.every((c) => c.state === "not_connected"), "tenant A must see its own disconnected state, never tenant B's connected one");
    } finally {
      mock.restore();
    }
  }

  // ===== snapshots persisted truthfully: saveMeasurementSnapshot round-trips real dimensions/values/period bounds =====
  {
    const store: Record<string, any[]> = { search_measurement_snapshots: [] };
    const db = {
      from(table: string) {
        return {
          upsert(patch: any) {
            return {
              select() {
                return {
                  async single() {
                    const row = { id: "snap-1", ...patch };
                    store[table].push(row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
    const saved = await saveMeasurementSnapshot(db as any, {
      tenantId: "tenant-a",
      projectId: "proj-1",
      runId: "run-1",
      source: "search_console",
      dimensions: { rowCount: 1 },
      values: { rows: [{ query: "shoes", clicks: 4 }] },
      availabilityState: "connected",
      fingerprint: "fp-1",
      periodStart: "2026-07-13",
      periodEnd: "2026-08-09",
    });
    assert.deepEqual(saved.values, { rows: [{ query: "shoes", clicks: 4 }] }, "the exact real values must round-trip, nothing substituted");
    assert.equal(saved.period_start, "2026-07-13");
    assert.equal(saved.period_end, "2026-08-09");
    assert.equal(saved.availability_state, "connected");
  }

  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;

  console.log("google-runtime-bridge.test.ts: ALL PASS (independent GSC/GA4 resolution, failure isolation, tenant isolation, truthful snapshot persistence)");
}

run();
