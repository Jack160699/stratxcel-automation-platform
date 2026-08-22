// Shared test-only fake Supabase client for outbound-send and auto-reply
// tests. Not a test file itself (no assertions, no run()) — imported by
// packages/whatsapp/src/__tests__/outbound.test.ts and
// apps/whatsapp-worker/src/__tests__/auto-reply.test.ts so both exercise
// the exact same in-memory semantics rather than two drifting mocks.
//
// Implements just enough of the real supabase-js query-builder surface for
// sendOutboundWhatsAppMessage's full call graph (crm_leads, whatsapp_phone_bindings,
// kill_switches, usage_entitlements, whatsapp_conversations, whatsapp_templates,
// contact_consent, whatsapp_shadow_messages, whatsapp_messages, audit_events, and
// the record_whatsapp_message RPC) to run for real, in-memory, with zero network.

export type Tables = Record<string, Array<Record<string, unknown>>>;

export interface FakeSupabaseHandle {
  client: any;
  tables: Tables;
  /** Every `.from(table)` call, in order — lets a test assert an orchestration attempt happened (or didn't) without depending on its outcome. */
  fromCalls: string[];
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

function matches(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

function recordWhatsAppMessageRpc(tables: Tables, params: Record<string, unknown>) {
  const p = params as {
    p_tenant_id: string;
    p_lead_id: string;
    p_phone_binding_id: string | null;
    p_direction: "inbound" | "outbound";
    p_body: string;
    p_provider_message_id: string | null;
    p_idempotency_key: string | null;
    p_media_ref: string | null;
    p_template_id: string | null;
    p_status: string;
  };
  const messages = (tables.whatsapp_messages ??= []);

  let existing: Record<string, unknown> | undefined;
  if (p.p_direction === "inbound" && p.p_provider_message_id) {
    existing = messages.find((m) => m.tenant_id === p.p_tenant_id && m.provider_message_id === p.p_provider_message_id);
  } else if (p.p_direction === "outbound" && p.p_idempotency_key) {
    existing = messages.find((m) => m.tenant_id === p.p_tenant_id && m.idempotency_key === p.p_idempotency_key);
  }
  if (existing) {
    return { data: { success: true, already_recorded: true, message_id: existing.id, conversation_id: existing.conversation_id }, error: null };
  }

  let convo = (tables.whatsapp_conversations ??= []).find((c) => c.tenant_id === p.p_tenant_id && c.lead_id === p.p_lead_id);
  if (!convo) {
    convo = {
      id: nextId("convo"),
      tenant_id: p.p_tenant_id,
      lead_id: p.p_lead_id,
      phone_binding_id: p.p_phone_binding_id,
      automation_mode: "automated",
      status: "open",
    };
    tables.whatsapp_conversations.push(convo);
  }

  const row = {
    id: nextId("msg"),
    tenant_id: p.p_tenant_id,
    conversation_id: convo.id,
    lead_id: p.p_lead_id,
    direction: p.p_direction,
    body: p.p_body,
    provider_message_id: p.p_provider_message_id ?? null,
    idempotency_key: p.p_idempotency_key ?? null,
    media_ref: p.p_media_ref ?? null,
    template_id: p.p_template_id ?? null,
    status: p.p_status ?? "queued",
    status_updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  messages.push(row);
  return { data: { success: true, already_recorded: false, message_id: row.id, conversation_id: convo.id }, error: null };
}

function updateWhatsAppMessageStatusRpc(tables: Tables, params: Record<string, unknown>) {
  const p = params as { p_tenant_id: string; p_provider_message_id: string; p_status: string };
  const row = (tables.whatsapp_messages ?? []).find((m) => m.tenant_id === p.p_tenant_id && m.provider_message_id === p.p_provider_message_id);
  if (!row) return { data: { success: false, reason: "not_found" }, error: null };
  row.status = p.p_status;
  row.status_updated_at = new Date().toISOString();
  return { data: { success: true, updated: true }, error: null };
}

export interface FakeSupabaseOptions {
  /** RPC names to make throw (a stand-in for a genuine transient DB/network failure), for tests that need to prove a caller's error handling rather than its happy path. */
  failRpc?: string[];
}

export function createFakeSupabase(seed: Tables = {}, options: FakeSupabaseOptions = {}): FakeSupabaseHandle {
  const tables: Tables = { ...seed };
  const fromCalls: string[] = [];
  const failRpc = new Set(options.failRpc ?? []);

  function resolveUpsert(): { data: Record<string, unknown>; error: null } {
    const rows = (tables[chain._table] ??= []);
    const keys = chain._upsertKeys as string[];
    const payload = chain._payload as Record<string, unknown>;
    const existing = rows.find((row) => keys.length > 0 && keys.every((key) => row[key] === payload[key]));
    if (existing) {
      Object.assign(existing, payload);
      return { data: existing, error: null };
    }
    const row = { id: nextId(chain._table), ...payload };
    rows.push(row);
    return { data: row, error: null };
  }

  const chain: any = {
    _table: "",
    _filters: {} as Record<string, unknown>,
    _mode: "select" as "select" | "insert" | "update" | "upsert",
    _payload: null as Record<string, unknown> | null,
    _upsertKeys: [] as string[],
    from(table: string) {
      fromCalls.push(table);
      chain._table = table;
      chain._filters = {};
      chain._mode = "select";
      chain._payload = null;
      chain._upsertKeys = [];
      return chain;
    },
    select() {
      return chain;
    },
    insert(payload: Record<string, unknown>) {
      chain._mode = "insert";
      chain._payload = payload;
      return chain;
    },
    update(payload: Record<string, unknown>) {
      chain._mode = "update";
      chain._payload = payload;
      return chain;
    },
    upsert(payload: Record<string, unknown>, options?: { onConflict?: string }) {
      chain._mode = "upsert";
      chain._payload = payload;
      chain._upsertKeys = options?.onConflict?.split(",") ?? [];
      // Chainable (like real supabase-js): a caller may await this directly
      // (resolved via .then() below) or chain .select().single() first.
      return chain;
    },
    eq(col: string, val: unknown) {
      chain._filters[col] = val;
      return chain;
    },
    not() {
      return chain;
    },
    gt() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    async maybeSingle() {
      const rows = tables[chain._table] ?? [];
      const match = rows.find((r) => matches(r, chain._filters));
      return { data: match ?? null, error: null };
    },
    async single() {
      if (chain._mode === "insert") {
        const row = { id: nextId(chain._table), ...chain._payload };
        (tables[chain._table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (chain._mode === "upsert") return resolveUpsert();
      const rows = tables[chain._table] ?? [];
      const match = rows.find((r) => matches(r, chain._filters));
      if (chain._mode === "update" && match) Object.assign(match, chain._payload);
      return { data: match ?? null, error: null };
    },
    // supabase-js query builders are themselves thenable — awaiting the
    // chain directly (no .single()/.maybeSingle()) is how outbound.ts's
    // final status-backfill `.update().eq().eq()` call resolves, and how a
    // bare `.insert(payload)` (no `.select()`) — e.g. recordShadowResponse,
    // recordAuditEvent, createHumanHandoff — actually persists in real
    // Postgres/PostgREST too.
    then(resolve: (v: { data: unknown; error: null }) => void) {
      if (chain._mode === "insert") {
        const row = { id: nextId(chain._table), ...chain._payload };
        (tables[chain._table] ??= []).push(row);
        resolve({ data: row, error: null });
      } else if (chain._mode === "upsert") {
        resolve(resolveUpsert());
      } else if (chain._mode === "update") {
        const rows = tables[chain._table] ?? [];
        const affected = rows.filter((r) => matches(r, chain._filters));
        affected.forEach((r) => Object.assign(r, chain._payload));
        resolve({ data: affected, error: null });
      } else {
        const rows = tables[chain._table] ?? [];
        resolve({ data: rows.filter((r) => matches(r, chain._filters)), error: null });
      }
    },
    async rpc(name: string, params: Record<string, unknown>) {
      if (failRpc.has(name)) throw new Error(`fake-supabase: simulated transient failure for rpc ${name}`);
      if (name === "record_whatsapp_message") return recordWhatsAppMessageRpc(tables, params);
      if (name === "update_whatsapp_message_status") return updateWhatsAppMessageStatusRpc(tables, params);
      return { data: null, error: { message: `fake-supabase: no handler for rpc ${name}` } };
    },
  };

  return { client: chain, tables, fromCalls };
}
