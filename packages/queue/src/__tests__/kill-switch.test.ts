// Run with: node --experimental-strip-types packages/queue/src/__tests__/kill-switch.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { isKillSwitchActive } from "../kill-switch.ts";

type Row = { scope: string; scope_id: string; enabled: boolean; reason: string | null };

function fakeSupabase(rows: Row[], opts: { errorOnScope?: string } = {}): ServiceClient {
  const chain = {
    _filters: {} as Record<string, string>,
    from(_table: string) {
      chain._filters = {};
      return chain;
    },
    select() {
      return chain;
    },
    eq(column: string, value: string) {
      chain._filters[column] = value;
      return chain;
    },
    async maybeSingle() {
      if (opts.errorOnScope && chain._filters.scope === opts.errorOnScope) {
        return { data: null, error: { message: "connection refused" } };
      }
      const match = rows.find((r) => r.scope === chain._filters.scope && r.scope_id === chain._filters.scope_id);
      return { data: match ?? null, error: null };
    },
  };
  return chain as unknown as ServiceClient;
}

async function run() {
  // --- 1. No matching row -> not active -----------------------------------
  const empty = fakeSupabase([]);
  assert.equal((await isKillSwitchActive(empty, [{ scope: "global_hermes" }])).active, false);

  // --- 2. Global switch active blocks regardless of narrower scopes -------
  const global = fakeSupabase([{ scope: "global_hermes", scope_id: "", enabled: true, reason: "incident" }]);
  const globalResult = await isKillSwitchActive(global, [{ scope: "global_hermes" }, { scope: "worker_type", scopeId: "mission-worker" }]);
  assert.equal(globalResult.active, true);
  assert.equal(globalResult.scope, "global_hermes");
  assert.equal(globalResult.reason, "incident");

  // --- 3. Disabled row is not active (a switch record existing isn't enough)
  const disabled = fakeSupabase([{ scope: "tenant", scope_id: "t1", enabled: false, reason: null }]);
  assert.equal((await isKillSwitchActive(disabled, [{ scope: "tenant", scopeId: "t1" }])).active, false);

  // --- 4. Tenant isolation: t2's check never sees t1's active switch ------
  const tenantScoped = fakeSupabase([{ scope: "tenant", scope_id: "t1", enabled: true, reason: "fraud review" }]);
  assert.equal((await isKillSwitchActive(tenantScoped, [{ scope: "tenant", scopeId: "t2" }])).active, false);
  assert.equal((await isKillSwitchActive(tenantScoped, [{ scope: "tenant", scopeId: "t1" }])).active, true);

  // --- 5. Fail closed: a read error is treated as active, never as "fine" -
  const broken = fakeSupabase([], { errorOnScope: "global_hermes" });
  const brokenResult = await isKillSwitchActive(broken, [{ scope: "global_hermes" }]);
  assert.equal(brokenResult.active, true, "an unreadable kill-switch table must fail closed (active), not open");

  console.log("kill-switch.test.ts (@stratxcel/queue): ALL PASS");
}

run();
