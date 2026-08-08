// Run with: node --experimental-strip-types packages/queue/src/__tests__/worker-heartbeat.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { getWorkerHealth } from "../worker-heartbeat.ts";

type Row = { worker_type: string; instance_id: string; status: string; last_heartbeat_at: string; version: string | null; queue_backlog_hint: number | null; last_error: unknown };

function fakeSupabase(rows: Row[], opts: { fail?: boolean } = {}): ServiceClient {
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
    order() {
      return chain;
    },
  };
  // `.limit()` is the terminal call in getWorkerHealth's chain — make it thenable.
  (chain as unknown as { limit: () => unknown }).limit = () => ({
    then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void) => {
      if (opts.fail) {
        resolve({ data: null, error: { message: "connection refused" } });
        return;
      }
      const matches = rows.filter((r) => r.worker_type === chain._filters.worker_type);
      resolve({ data: matches, error: null });
    },
  });
  return chain as unknown as ServiceClient;
}

const now = () => new Date().toISOString();
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

async function run() {
  // --- 1. No instance has ever reported -> unavailable ---------------------
  const none = fakeSupabase([]);
  const noneResult = await getWorkerHealth(none, "mission-worker");
  assert.equal(noneResult.status, "unavailable");

  // --- 2. A live, idle instance -> healthy ---------------------------------
  const healthy = fakeSupabase([
    { worker_type: "mission-worker", instance_id: "a", status: "idle", last_heartbeat_at: now(), version: "sha1", queue_backlog_hint: 0, last_error: null },
  ]);
  assert.equal((await getWorkerHealth(healthy, "mission-worker")).status, "healthy");

  // --- 3. Every instance stale -> unavailable, not "healthy with 0 workers"
  const stale = fakeSupabase([
    { worker_type: "mission-worker", instance_id: "a", status: "idle", last_heartbeat_at: minutesAgo(10), version: "sha1", queue_backlog_hint: null, last_error: null },
  ]);
  assert.equal((await getWorkerHealth(stale, "mission-worker")).status, "unavailable");

  // --- 4. A live instance self-reporting degraded pulls status down --------
  const degraded = fakeSupabase([
    { worker_type: "mission-worker", instance_id: "a", status: "degraded", last_heartbeat_at: now(), version: "sha1", queue_backlog_hint: null, last_error: { message: "db timeout" } },
  ]);
  assert.equal((await getWorkerHealth(degraded, "mission-worker")).status, "degraded");

  // --- 5. A different worker_type's rows never leak into this report -------
  const other = fakeSupabase([
    { worker_type: "whatsapp-worker", instance_id: "a", status: "idle", last_heartbeat_at: now(), version: "sha1", queue_backlog_hint: null, last_error: null },
  ]);
  assert.equal((await getWorkerHealth(other, "mission-worker")).status, "unavailable");

  // --- 6. DB read failure -> unavailable, never silently "healthy" --------
  const broken = fakeSupabase([], { fail: true });
  assert.equal((await getWorkerHealth(broken, "mission-worker")).status, "unavailable");

  console.log("worker-heartbeat.test.ts (@stratxcel/queue): ALL PASS");
}

run();
