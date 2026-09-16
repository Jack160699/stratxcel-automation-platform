// Instagram OAuth account binding: a reconnect must never re-point a tenant's
// connection at a different Instagram account.
// Run with: node --experimental-strip-types lib/social/__tests__/instagram-account-binding.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBoundProviderAccount,
  OAuthAccountMismatchError,
  resolveExpectedProviderAccountId,
} from "../oauth-account-binding.ts";
import { createSignedState, verifySignedState } from "../oauth-state.ts";
import { upsertConnectedAccount } from "../repositories/accounts.ts";

process.env.SOCIAL_OAUTH_STATE_SECRET ??= Buffer.alloc(32, "s").toString("base64");
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, "k").toString("base64");

console.log("Running Instagram OAuth account binding tests...\n");

const DBS_TENANT = "33730d17-8bf1-4435-a9d8-8b3e98bbb74d";
const SX_TENANT = "466e6195-a9f6-4576-8271-29fdae61c18a";
const DBS_OWNER = "af1b836d-8a89-4516-afd3-fd5de10e692c";
const DBS_IG = { id: "17841429966566939", username: "@durgsolar" };
const SX_IG = { id: "17841480038460404", username: "@stratxcel.in" };

function seedRows() {
  return {
    socialAccounts: [
      {
        id: "dbs-ig-row",
        owner_id: DBS_OWNER,
        tenant_id: DBS_TENANT,
        platform: "instagram",
        provider_account_id: DBS_IG.id,
        username: DBS_IG.username,
        status: "DISCONNECTED",
        token_health: "REVOKED",
        metadata: {},
      },
      {
        id: "sx-ig-row",
        owner_id: "sx-owner",
        tenant_id: SX_TENANT,
        platform: "instagram",
        provider_account_id: SX_IG.id,
        username: SX_IG.username,
        status: "CONNECTED",
        token_health: "HEALTHY",
        metadata: {},
      },
    ] as any[],
    socialTokens: [{ account_id: "dbs-ig-row", access_token_encrypted: "", refresh_token_encrypted: null }] as any[],
  };
}

// Mock service client covering exactly the queries these code paths make.
// Records every filter and write so the tests can assert scoping and "nothing written".
function createMockDb(rows = seedRows()) {
  const log = { filters: [] as Array<[string, string, unknown]>, accountWrites: 0, tokenWrites: 0 };
  const service: any = {
    from(table: string) {
      if (table === "social_accounts") {
        return {
          select() {
            const filters: Array<[string, unknown]> = [];
            const query: any = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                log.filters.push([table, col, val]);
                return query;
              },
              limit() {
                return query;
              },
              async maybeSingle() {
                const match = rows.socialAccounts.filter((r) => filters.every(([c, v]) => r[c] === v));
                return { data: match[0] ?? null, error: null };
              },
            };
            return query;
          },
          update(patch: any) {
            log.accountWrites++;
            return {
              eq(col: string, val: unknown) {
                const row = rows.socialAccounts.find((r) => r[col] === val);
                if (row) Object.assign(row, patch);
                return { select: () => ({ single: async () => ({ data: row ?? null, error: row ? null : { message: "not found" } }) }) };
              },
            };
          },
          upsert() {
            log.accountWrites++;
            throw new Error("upsert must not be reached when a tenant row exists");
          },
        };
      }
      if (table === "social_tokens") {
        return {
          upsert(payload: any) {
            log.tokenWrites++;
            const existing = rows.socialTokens.find((t) => t.account_id === payload.account_id);
            if (existing) Object.assign(existing, payload);
            else rows.socialTokens.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unhandled table ${table}`);
    },
  };
  return { service, rows, log };
}

// 1. The binding survives the signed state round-trip and cannot be edited.
{
  const { token } = createSignedState("instagram", "/app/integrations", DBS_TENANT, undefined, DBS_IG.id);
  const verified = verifySignedState(token);
  assert.equal(verified.valid, true);
  if (verified.valid) {
    assert.equal(verified.payload.tenantId, DBS_TENANT);
    assert.equal(verified.payload.expectedAccountId, DBS_IG.id);
  }

  const [payloadB64, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  payload.expectedAccountId = SX_IG.id;
  const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
  const forgedResult = verifySignedState(forged);
  assert.equal(forgedResult.valid, false, "re-pointing the bound account in the state must break the signature");
  console.log("  ok  expected account is signed into the OAuth state and tamper-evident");
}

// 2. Callback gate: wrong Instagram account rejected, correct account accepted.
{
  assert.throws(
    () => assertBoundProviderAccount("instagram", DBS_IG.id, SX_IG.id),
    (err: unknown) =>
      err instanceof OAuthAccountMismatchError &&
      err.expectedAccountId === DBS_IG.id &&
      err.actualAccountId === SX_IG.id,
    "consent from @stratxcel.in must be rejected for a state bound to @durgsolar"
  );
  assert.throws(
    () => assertBoundProviderAccount("instagram", DBS_IG.id, ""),
    OAuthAccountMismatchError,
    "an unidentifiable authorized account must fail closed"
  );
  assert.doesNotThrow(() => assertBoundProviderAccount("instagram", DBS_IG.id, DBS_IG.id));
  assert.doesNotThrow(
    () => assertBoundProviderAccount("instagram", undefined, SX_IG.id),
    "a first-time connect with no existing connection has nothing to bind to"
  );
  console.log("  ok  callback gate rejects the wrong account and accepts the bound one");
}

// 3. /connect resolves the binding from the requesting tenant's own row only.
{
  const { service, log } = createMockDb();
  assert.equal(await resolveExpectedProviderAccountId(service, "instagram", DBS_TENANT), DBS_IG.id);
  assert.deepEqual(
    log.filters.map(([, c, v]) => [c, v]),
    [["tenant_id", DBS_TENANT], ["platform", "instagram"]],
    "lookup must be scoped by tenant_id and platform"
  );
  assert.equal(await resolveExpectedProviderAccountId(service, "instagram", SX_TENANT), SX_IG.id);
  assert.equal(await resolveExpectedProviderAccountId(service, "instagram", "tenant-without-instagram"), undefined);
  assert.equal(
    await resolveExpectedProviderAccountId(service, "facebook", DBS_TENANT),
    undefined,
    "Facebook keeps its own Page-level binding and is not bound here"
  );

  const failing: any = {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "db down" } }) }) }) }) }) }),
  };
  await assert.rejects(() => resolveExpectedProviderAccountId(failing, "instagram", DBS_TENANT), /db down/);
  console.log("  ok  binding is resolved tenant-scoped and fails closed on lookup errors");
}

// 4. Persistence: wrong account cannot overwrite the DBS connection.
{
  const { service, rows, log } = createMockDb();
  const before = structuredClone(rows.socialAccounts.find((r) => r.id === "dbs-ig-row"));
  const tokenBefore = structuredClone(rows.socialTokens[0]);

  await assert.rejects(
    () =>
      upsertConnectedAccount(service, {
        ownerId: DBS_OWNER,
        tenantId: DBS_TENANT,
        platform: "instagram",
        providerAccountId: SX_IG.id,
        username: SX_IG.username,
        permissions: ["instagram_business_content_publish"],
        accessToken: "corporate-token",
        expiresInSeconds: 5_184_000,
      }),
    OAuthAccountMismatchError
  );

  assert.deepEqual(rows.socialAccounts.find((r) => r.id === "dbs-ig-row"), before, "DBS row must be untouched");
  assert.deepEqual(rows.socialTokens[0], tokenBefore, "DBS token row must be untouched");
  assert.equal(log.accountWrites, 0, "no social_accounts write may happen");
  assert.equal(log.tokenWrites, 0, "no social_tokens write may happen");
  assert.equal(rows.socialAccounts.find((r) => r.id === "sx-ig-row").tenant_id, SX_TENANT, "corporate row stays in its own tenant");
  console.log("  ok  wrong account rejected at persistence; DBS connection and token not overwritten");
}

// 5. Persistence: the correct account reconnects the same DBS row.
{
  const { service, rows, log } = createMockDb();
  const accountId = await upsertConnectedAccount(service, {
    ownerId: DBS_OWNER,
    tenantId: DBS_TENANT,
    platform: "instagram",
    providerAccountId: DBS_IG.id,
    username: DBS_IG.username,
    permissions: ["instagram_business_content_publish"],
    accessToken: "dbs-token",
    expiresInSeconds: 5_184_000,
  });

  assert.equal(accountId, "dbs-ig-row", "reconnect must update the existing DBS row, not create another");
  const row = rows.socialAccounts.find((r) => r.id === "dbs-ig-row");
  assert.equal(row.tenant_id, DBS_TENANT);
  assert.equal(row.provider_account_id, DBS_IG.id);
  assert.equal(row.username, DBS_IG.username);
  assert.equal(row.status, "CONNECTED");
  assert.equal(row.token_health, "HEALTHY");
  assert.equal(log.tokenWrites, 1);
  assert.ok(rows.socialTokens[0].access_token_encrypted, "a fresh encrypted token must be stored");
  assert.notEqual(rows.socialTokens[0].access_token_encrypted, "dbs-token", "token must be stored encrypted");
  console.log("  ok  correct account accepted; DBS row reconnected CONNECTED/HEALTHY");
}

// 6. Route wiring: /connect signs the binding, /callback enforces it before any write.
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const routeDir = path.join(here, "..", "..", "..", "app", "api", "social", "oauth", "[provider]");
  const connect = strip(fs.readFileSync(path.join(routeDir, "connect", "route.ts"), "utf8"));
  const callback = strip(fs.readFileSync(path.join(routeDir, "callback", "route.ts"), "utf8"));

  assert.match(connect, /resolveExpectedProviderAccountId\(service, provider, resolvedTenantId\)/);
  assert.match(connect, /createSignedState\([\s\S]*?expectedAccountId\s*\)/, "/connect must sign expectedAccountId into the state");

  const gate = callback.search(/assertBoundProviderAccount\(provider, verified\.payload\.expectedAccountId, result\.externalAccountId\)/);
  const firstWrite = callback.search(/upsertConnectedAccount\(/);
  assert.ok(gate > 0, "/callback must enforce the signed binding");
  assert.ok(firstWrite > gate, "the binding check must run before the first persistence call");
  assert.match(callback, /err instanceof OAuthAccountMismatchError[\s\S]*?failRedirect\("error", "account_mismatch"\)/);
  assert.match(callback, /upsertErr instanceof OAuthAccountMismatchError\) throw upsertErr/);
  console.log("  ok  /connect signs the binding and /callback rejects before persisting");
}

console.log("\nALL INSTAGRAM ACCOUNT BINDING TESTS PASSED\n");
