import assert from "node:assert/strict";
import { upsertConnectedAccount } from "../repositories/accounts.ts";

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, "k").toString("base64");

console.log("Running StratXcel OAuth Callback Persistence Hardening Tests...\n");

function createMockDb() {
  const socialAccounts: any[] = [];
  const socialTokens: any[] = [];
  const tenantMembers: any[] = [];

  const service: any = {
    from(tableName: string) {
      if (tableName === "tenant_members") {
        return {
          select(cols = "*") {
            let filterUserId: string | null = null;
            let filterTenantId: string | null = null;
            const query: any = {
              eq(col: string, val: any) {
                if (col === "user_id") filterUserId = val;
                if (col === "tenant_id") filterTenantId = val;
                return query;
              },
              async maybeSingle() {
                const rows = tenantMembers.filter(
                  (m) => (!filterUserId || m.user_id === filterUserId) && (!filterTenantId || m.tenant_id === filterTenantId)
                );
                return { data: rows[0] || null, error: null };
              },
              then(resolve: any) {
                const rows = tenantMembers.filter(
                  (m) => (!filterUserId || m.user_id === filterUserId) && (!filterTenantId || m.tenant_id === filterTenantId)
                );
                return resolve({ data: rows, error: null });
              },
            };
            return query;
          },
        };
      }

      if (tableName === "social_accounts") {
        return {
          select(cols = "*") {
            let filterTenantId: string | null = null;
            let filterPlatform: string | null = null;
            const query: any = {
              eq(col: string, val: any) {
                if (col === "tenant_id") filterTenantId = val;
                if (col === "platform") filterPlatform = val;
                return query;
              },
              limit() {
                return query;
              },
              async maybeSingle() {
                const rows = socialAccounts.filter(
                  (a) => (!filterTenantId || a.tenant_id === filterTenantId) && (!filterPlatform || a.platform === filterPlatform)
                );
                return { data: rows[0] || null, error: null };
              },
            };
            return query;
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const row = socialAccounts.find((a) => a[col] === val);
                if (row) Object.assign(row, patch);
                return {
                  select() {
                    return {
                      single: async () => ({ data: row || null, error: row ? null : new Error("Not found") }),
                    };
                  },
                };
              },
            };
          },
          upsert(payload: any, options: { onConflict?: string } = {}) {
            const conflictKey = options.onConflict || "id";
            const keys = conflictKey.split(",");
            const existingIndex = socialAccounts.findIndex((a) => keys.every((k) => a[k] === payload[k]));
            let record: any;
            if (existingIndex >= 0) {
              record = Object.assign(socialAccounts[existingIndex], payload);
            } else {
              record = { id: `sa_${Date.now()}_${Math.random()}`, ...payload };
              socialAccounts.push(record);
            }
            return {
              select() {
                return {
                  single: async () => ({ data: record, error: null }),
                };
              },
            };
          },
        };
      }

      if (tableName === "social_tokens") {
        return {
          upsert(payload: any) {
            const idx = socialTokens.findIndex((t) => t.account_id === payload.account_id);
            if (idx >= 0) {
              socialTokens[idx] = Object.assign(socialTokens[idx], payload);
            } else {
              socialTokens.push(payload);
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unhandled table ${tableName}`);
    },
  };

  return { service, socialAccounts, socialTokens, tenantMembers };
}

// TEST 1: Tenant from signed OAuth state persists with correct tenant_id
{
  console.log("Test 1: Tenant-bound OAuth upsert...");
  const { service, socialAccounts } = createMockDb();
  const accountId = await upsertConnectedAccount(service, {
    ownerId: "user_123",
    tenantId: "tenant_abc",
    platform: "instagram",
    providerAccountId: "ig_123",
    username: "@stratxcel",
    displayName: "StratXcel",
    permissions: ["read", "write"],
    accessToken: "tok_123",
  });

  assert.ok(accountId);
  assert.equal(socialAccounts.length, 1);
  assert.equal(socialAccounts[0].tenant_id, "tenant_abc");
  assert.equal(socialAccounts[0].platform, "instagram");
  assert.equal(socialAccounts[0].status, "CONNECTED");
  console.log("✓ Tenant-bound OAuth persistence verified.");
}

// TEST 2: Reconnection updates existing row without duplicate
{
  console.log("Test 2: Idempotent reconnection on (tenant_id, platform)...");
  const { service, socialAccounts } = createMockDb();
  await upsertConnectedAccount(service, {
    ownerId: "user_123",
    tenantId: "tenant_abc",
    platform: "youtube",
    providerAccountId: "yt_old",
    username: "StratXcel Old",
    permissions: ["upload"],
    accessToken: "tok_old",
  });

  assert.equal(socialAccounts.length, 1);
  assert.equal(socialAccounts[0].username, "StratXcel Old");

  await upsertConnectedAccount(service, {
    ownerId: "user_123",
    tenantId: "tenant_abc",
    platform: "youtube",
    providerAccountId: "yt_new",
    username: "StratXcel New",
    permissions: ["upload"],
    accessToken: "tok_new",
  });

  assert.equal(socialAccounts.length, 1, "Must maintain exactly 1 row per tenant/platform");
  assert.equal(socialAccounts[0].username, "StratXcel New");
  assert.equal(socialAccounts[0].status, "CONNECTED");
  console.log("✓ Idempotent reconnection verified.");
}

// TEST 3: Fail fast when DB throws error
{
  console.log("Test 3: Fail fast on DB failure...");
  const failingService: any = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return {
                        maybeSingle: async () => ({ data: null, error: new Error("DB connection lost") }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    async () => {
      await upsertConnectedAccount(failingService, {
        ownerId: "user_123",
        tenantId: "tenant_abc",
        platform: "facebook",
        providerAccountId: "fb_123",
        username: "StratXcel",
        permissions: ["manage"],
        accessToken: "tok_fb",
      });
    },
    { message: /Failed to query social_accounts/ }
  );
  console.log("✓ Fail fast verified.");
}

console.log("\n=======================================================");
console.log("ALL OAUTH CALLBACK PERSISTENCE HARDENING TESTS PASSED!");
console.log("=======================================================\n");
