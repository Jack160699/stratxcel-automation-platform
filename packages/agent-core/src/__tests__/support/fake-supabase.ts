// Test-only in-memory fake of the supabase-js query-builder surface, scoped
// to what @stratxcel/agent-core's repositories actually call. Not a test
// file itself — imported by the pairing/confirmations/principals/tenant-
// isolation tests below. A separate, smaller fake than
// packages/whatsapp/src/__tests__/support/fake-supabase.ts because this
// package's atomic-claim pattern relies on `.is()` null-filters that that
// fake doesn't implement.

export type Tables = Record<string, Array<Record<string, unknown>>>;

const IS_NULL = Symbol("is_null");

function matches(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => (v === IS_NULL ? row[k] === null || row[k] === undefined : row[k] === v));
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export interface FakeSupabaseHandle {
  client: unknown;
  tables: Tables;
}

export function createFakeSupabase(seed: Tables = {}): FakeSupabaseHandle {
  const tables: Tables = { ...seed };

  function makeChain() {
    const state = {
      table: "",
      filters: {} as Record<string, unknown>,
      mode: "select" as "select" | "insert" | "update",
      payload: null as Record<string, unknown> | null,
    };

    const chain: any = {
      from(table: string) {
        state.table = table;
        state.filters = {};
        state.mode = "select";
        state.payload = null;
        (tables[table] ??= []);
        return chain;
      },
      select() {
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        state.mode = "insert";
        state.payload = payload;
        // Push immediately (not deferred to .single()/.then()) so a bare
        // `await supabase.from(x).insert(y)` — with no .select()/.single()
        // chained at all, as several agent-core repository functions do —
        // still actually persists the row.
        const row = { id: nextId(state.table), created_at: new Date().toISOString(), ...payload };
        (tables[state.table] ??= []).push(row);
        state.filters = { id: row.id };
        return chain;
      },
      update(payload: Record<string, unknown>) {
        state.mode = "update";
        state.payload = payload;
        return chain;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return chain;
      },
      is(col: string, val: null) {
        state.filters[col] = val === null ? IS_NULL : val;
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      or() {
        return chain;
      },
      async maybeSingle() {
        if (state.mode === "update") {
          const rows = tables[state.table] ?? [];
          const affected = rows.filter((r) => matches(r, state.filters));
          affected.forEach((r) => Object.assign(r, state.payload));
          return { data: affected[0] ?? null, error: null };
        }
        const rows = tables[state.table] ?? [];
        const match = rows.find((r) => matches(r, state.filters));
        return { data: match ?? null, error: null };
      },
      async single() {
        const result = await chain.maybeSingle();
        if (!result.data) return { data: null, error: { message: "no rows", code: "PGRST116" } };
        return result;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (state.mode === "update") {
          const rows = tables[state.table] ?? [];
          const affected = rows.filter((r) => matches(r, state.filters));
          affected.forEach((r) => Object.assign(r, state.payload));
          resolve({ data: affected, error: null });
        } else {
          const rows = tables[state.table] ?? [];
          resolve({ data: rows.filter((r) => matches(r, state.filters)), error: null });
        }
      },
    };
    return chain;
  }

  return { client: { from: (table: string) => makeChain().from(table) }, tables };
}
