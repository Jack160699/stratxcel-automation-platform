// Run with: node --experimental-strip-types packages/queue/src/__tests__/whatsapp-terminal-idempotency.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { createPostgresQueueAdapter } from "../postgres-adapter.ts";
import type { QueueJobRow } from "../types.ts";

type Row = QueueJobRow & Record<string, unknown>;

function fakeSupabase(
  rows: Row[],
  uniqueOn: (a: Row, b: Partial<Row>) => boolean
): ServiceClient {
  let nextId = 1;
  const chain = {
    _table: "",
    _filters: {} as Record<string, string>,
    _insertPayload: null as Partial<Row> | null,
    from(table: string) {
      chain._table = table;
      chain._filters = {};
      chain._insertPayload = null;
      return chain;
    },
    insert(payload: Partial<Row>) {
      chain._insertPayload = payload;
      return chain;
    },
    select() {
      return chain;
    },
    eq(column: string, value: string) {
      chain._filters[column] = value;
      return chain;
    },
    not(_column: string, _op: string, _value: string) {
      chain._filters.__excludeTerminal = "1";
      return chain;
    },
    async single() {
      const payload = chain._insertPayload!;
      const conflict = rows.find((r) => uniqueOn(r, payload));
      if (conflict) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      const row: Row = {
        id: `job-${nextId++}`,
        tenant_id: payload.tenant_id as string,
        job_type: payload.job_type as string,
        payload: payload.payload ?? {},
        idempotency_key: (payload.idempotency_key as string | null) ?? null,
        priority: (payload.priority as number) ?? 100,
        scheduled_at: (payload.scheduled_at as string) ?? new Date().toISOString(),
        status: "PENDING",
        attempt_count: 0,
        max_attempts: (payload.max_attempts as number) ?? 5,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        last_error: null,
        trace_id: (payload.trace_id as string | null) ?? null,
        correlation_id: (payload.correlation_id as string | null) ?? null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      } as Row;
      rows.push(row);
      return { data: row, error: null };
    },
    async maybeSingle() {
      const excludeTerminal = chain._filters.__excludeTerminal === "1";
      const match = rows.find((r) => {
        if (chain._filters.tenant_id && r.tenant_id !== chain._filters.tenant_id) return false;
        if (chain._filters.job_type && r.job_type !== chain._filters.job_type) return false;
        if (chain._filters.idempotency_key && r.idempotency_key !== chain._filters.idempotency_key) return false;
        if (excludeTerminal && ["SUCCEEDED", "FAILED", "DEAD_LETTER", "CANCELLED"].includes(r.status)) return false;
        return true;
      });
      return { data: match ?? null, error: null };
    },
  };
  return chain as unknown as ServiceClient;
}

function uniqueOn(existing: Row, incoming: Partial<Row>): boolean {
  if (!incoming.idempotency_key) return false;
  if (existing.tenant_id !== incoming.tenant_id) return false;
  if (incoming.job_type === "whatsapp.process_inbound") {
    return existing.job_type === "whatsapp.process_inbound" && existing.idempotency_key === incoming.idempotency_key;
  }
  const terminal = ["SUCCEEDED", "FAILED", "DEAD_LETTER", "CANCELLED"].includes(existing.status);
  return !terminal && existing.idempotency_key === incoming.idempotency_key;
}

async function run() {
  {
    const rows: Row[] = [];
    const supabase = fakeSupabase(rows, uniqueOn);
    const adapter = createPostgresQueueAdapter(supabase);

    const first = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "whatsapp.process_inbound",
      idempotencyKey: "whatsapp_message:wamid.ABC123",
    });
    assert.equal(rows.length, 1, "first enqueue should succeed and create exactly one row");

    rows[0]!.status = "SUCCEEDED";

    const second = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "whatsapp.process_inbound",
      idempotencyKey: "whatsapp_message:wamid.ABC123",
    });

    assert.equal(second.id, first.id, "re-enqueue of a terminal whatsapp job must return the existing job, not throw or create a new one");
    assert.equal(rows.length, 1, "no second whatsapp.process_inbound queue row may exist for the same provider message id");
  }

  {
    const rows: Row[] = [];
    const supabase = fakeSupabase(rows, uniqueOn);
    const adapter = createPostgresQueueAdapter(supabase);

    const a = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "whatsapp.process_inbound",
      idempotencyKey: "whatsapp_message:wamid.SHARED",
    });
    rows[0]!.status = "SUCCEEDED";

    const b = await adapter.enqueue({
      tenantId: "tenant-b",
      jobType: "whatsapp.process_inbound",
      idempotencyKey: "whatsapp_message:wamid.SHARED",
    });

    assert.notEqual(a.id, b.id, "the same provider message id under a different tenant must be a distinct job");
    assert.equal(rows.length, 2, "two tenants each get their own row for the same idempotency key");
  }

  {
    const rows: Row[] = [];
    const supabase = fakeSupabase(rows, uniqueOn);
    const adapter = createPostgresQueueAdapter(supabase);

    const first = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "mission.dispatch",
      idempotencyKey: "mission:daily-digest",
    });
    rows[0]!.status = "SUCCEEDED";

    const second = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "mission.dispatch",
      idempotencyKey: "mission:daily-digest",
    });

    assert.notEqual(second.id, first.id, "a terminal generic job's idempotency key must remain reusable for a new occurrence");
    assert.equal(rows.length, 2, "generic terminal-key reuse must still create a fresh row, unlike whatsapp.process_inbound");
  }

  {
    const rows: Row[] = [];
    const supabase = fakeSupabase(rows, uniqueOn);
    const adapter = createPostgresQueueAdapter(supabase);

    const first = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "mission.dispatch",
      idempotencyKey: "mission:daily-digest",
    });
    const second = await adapter.enqueue({
      tenantId: "tenant-a",
      jobType: "mission.dispatch",
      idempotencyKey: "mission:daily-digest",
    });

    assert.equal(second.id, first.id, "an active (non-terminal) generic duplicate must still return the existing in-flight job");
    assert.equal(rows.length, 1, "active generic duplicate protection must not create a second row");
  }

  console.log("whatsapp-terminal-idempotency.test.ts (@stratxcel/queue): ALL PASS");
}

run();
