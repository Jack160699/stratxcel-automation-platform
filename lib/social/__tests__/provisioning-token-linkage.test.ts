// Regression test for a finding from live E2E testing on 2026-08-24:
// provisionTenantConnectorsFromMetadata always fabricated a fresh
// social_accounts row with status: CONNECTED / token_health: HEALTHY from
// onboarding metadata alone (username/providerAccountId/scopes) — with no
// check for whether a real token existed anywhere. Confirmed on a real
// production tenant: four social_accounts rows (Facebook, Google Business,
// Instagram, YouTube) all reporting healthy with zero matching
// social_tokens rows. Root cause: the OAuth callback discarded the real
// access/refresh token whenever it ran before a tenant existed (the normal
// onboarding-wizard case), instead of persisting it anywhere this function
// could later find and link.
//
// Fix (two-file): the callback now persists an owner-scoped social_accounts
// + social_tokens row (tenant_id null) with the real token in that
// pre-tenant case; this function now links that row by re-pointing its
// tenant_id when one exists, instead of creating a fresh, tokenless
// duplicate — and only fabricates a status when no real row exists,
// honestly (RECONNECT_REQUIRED / UNKNOWN), never CONNECTED / HEALTHY.
//
// Run with: node --experimental-strip-types lib/social/__tests__/provisioning-token-linkage.test.ts
import assert from "node:assert/strict";
import { provisionTenantConnectorsFromMetadata } from "../provisioning.ts";

function createTestDb() {
  const socialAccounts: Array<Record<string, unknown>> = [];
  const socialTokens: Array<Record<string, unknown>> = [];
  const whatsappBindings: Array<Record<string, unknown>> = [];

  const client = {
    from(table: string) {
      const rows = table === "social_accounts" ? socialAccounts : table === "social_tokens" ? socialTokens : table === "whatsapp_phone_bindings" ? whatsappBindings : (() => { throw new Error(`unhandled table: ${table}`); })();

      const applyFilters = (filters: Array<(r: Record<string, unknown>) => boolean>) => rows.filter((r) => filters.every((f) => f(r)));

      return {
        select() {
          const filters: Array<(r: Record<string, unknown>) => boolean> = [];
          const q = {
            eq(col: string, val: unknown) {
              filters.push((r) => r[col] === val);
              return q;
            },
            is(col: string, val: null) {
              filters.push((r) => (r[col] ?? null) === val);
              return q;
            },
            order() {
              return q;
            },
            limit() {
              return q;
            },
            async maybeSingle() {
              const matched = applyFilters(filters);
              return { data: matched[0] ?? null, error: null };
            },
          };
          return q;
        },
        insert(payload: Record<string, unknown>) {
          const row = { id: `${table}_${rows.length + 1}`, created_at: new Date().toISOString(), ...payload };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              const matched = rows.filter((r) => r[col] === val);
              matched.forEach((r) => Object.assign(r, patch));
              return Promise.resolve({ data: matched, error: null });
            },
          };
        },
      };
    },
  };

  return { client, socialAccounts, socialTokens };
}

async function run() {
  // --- Case A: a real, owner-scoped, token-bearing row exists (the OAuth
  // callback's pre-tenant persistence) — provisioning must link it, not
  // fabricate a duplicate, and must preserve its real CONNECTED/HEALTHY. ---
  {
    const { client, socialAccounts, socialTokens } = createTestDb();
    const userId = "user-1";
    socialAccounts.push({
      id: "acct-preexisting",
      owner_id: userId,
      tenant_id: null,
      platform: "instagram",
      provider_account_id: "ig_real_123",
      username: "@realbusiness",
      display_name: "Real Business",
      status: "CONNECTED",
      token_health: "HEALTHY",
    });
    socialTokens.push({
      id: "tok-1",
      account_id: "acct-preexisting",
      access_token_encrypted: "real_encrypted_token",
    });

    await provisionTenantConnectorsFromMetadata(client as never, {
      tenantId: "tenant-new",
      userId,
      userMetadata: {
        onboarding_oauth_connections: {
          instagram: { username: "@realbusiness", displayName: "Real Business", providerAccountId: "ig_real_123", scopes: ["instagram_business_basic"] },
        },
      },
    });

    assert.equal(socialAccounts.length, 1, "must link the existing owner-scoped row, not create a second one");
    assert.equal(socialAccounts[0]!.tenant_id, "tenant-new", "the existing row must be re-pointed to the new tenant");
    assert.equal(socialAccounts[0]!.status, "CONNECTED", "a row that genuinely has a token must stay CONNECTED");
    assert.equal(socialAccounts[0]!.token_health, "HEALTHY");
    assert.equal(socialTokens.length, 1, "the real token row must not be duplicated or lost");
    assert.equal(socialTokens[0]!.account_id, "acct-preexisting", "the token must still point at the same (now tenant-linked) account row");
  }

  // --- Case B: no owner-scoped row exists (metadata only, no real OAuth
  // ever completed for this account) — must not fabricate CONNECTED. ---
  {
    const { client, socialAccounts, socialTokens } = createTestDb();
    const userId = "user-2";

    await provisionTenantConnectorsFromMetadata(client as never, {
      tenantId: "tenant-new-2",
      userId,
      userMetadata: {
        onboarding_oauth_connections: {
          facebook: { username: "Some Page", displayName: "Some Page", providerAccountId: "fb_unknown", scopes: [] },
        },
      },
    });

    assert.equal(socialAccounts.length, 1);
    assert.equal(socialAccounts[0]!.status, "RECONNECT_REQUIRED", "with no real token anywhere, the row must not claim CONNECTED");
    assert.equal(socialAccounts[0]!.token_health, "UNKNOWN", "must not claim HEALTHY for a token that was never verified to exist");
    assert.equal(socialTokens.length, 0, "must not fabricate a token row either");
  }

  console.log("PASS: provisioning links real owner-scoped tokens instead of fabricating CONNECTED/HEALTHY from metadata alone");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
