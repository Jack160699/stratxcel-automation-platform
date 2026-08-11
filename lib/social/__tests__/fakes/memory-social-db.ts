/**
 * Minimal in-memory OwnerContext for Social Copilot productization integration tests.
 * Supports the query shapes used by review-session, edit revision, claim, and createContentVariant.
 */

import { randomUUID } from "node:crypto";
import type { OwnerContext } from "../../db-context.ts";

type Row = Record<string, unknown>;

export class MemorySocialDb {
  tables: Record<string, Row[]> = {
    social_agent_actions: [],
    social_agent_messages: [],
    social_agent_sessions: [],
    social_agent_runs: [],
    social_agent_run_events: [],
    content_variants: [],
    social_content_variant_media: [],
    social_brand_profiles: [],
    social_automation_settings: [],
  };

  generationKeyIndex = new Set<string>();

  insert(table: string, row: Row): Row {
    const withId: Row = { id: row.id ?? randomUUID(), ...row };
    if (table === "content_variants") {
      const spec = (withId.creative_spec ?? {}) as Record<string, unknown>;
      const key = typeof spec.generationKey === "string" ? spec.generationKey : "";
      if (key) {
        const indexKey = `${String(withId.master_id)}|${String(withId.platform)}|${key}`;
        if (this.generationKeyIndex.has(indexKey)) {
          const err = new Error("duplicate key value violates unique constraint content_variants_generation_key_uidx");
          (err as { code?: string }).code = "23505";
          throw err;
        }
        this.generationKeyIndex.add(indexKey);
      }
    }
    this.tables[table] = this.tables[table] ?? [];
    this.tables[table].push(withId);
    return withId;
  }

  asOwnerContext(ownerId = "owner-1"): OwnerContext {
    const db = this;
    const client = {
      from(table: string) {
        return createQuery(db, table);
      },
      async rpc(name: string) {
        return {
          data: null,
          error: { message: `Could not find the function public.${name} in the schema cache PGRST202` },
        };
      },
    };
    return {
      ok: true as const,
      ownerId,
      email: "owner@test.local",
      supabase: client as unknown as OwnerContext["supabase"],
    };
  }
}

function createQuery(db: MemorySocialDb, table: string) {
  const state: {
    filters: Array<(row: Row) => boolean>;
    order?: { col: string; asc: boolean };
    limit?: number;
    payload?: Row | Row[];
    mode: "select" | "insert" | "update";
    head?: boolean;
  } = { filters: [], mode: "select" };

  const api: Record<string, unknown> = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      // Supabase: insert/update().select() keeps write mode and returns rows.
      if (state.mode === "insert" || state.mode === "update") {
        state.head = opts?.head;
        return api;
      }
      state.mode = "select";
      state.head = opts?.head;
      return api;
    },
    insert(payload: Row | Row[]) {
      state.mode = "insert";
      state.payload = payload;
      return api;
    },
    update(payload: Row) {
      state.mode = "update";
      state.payload = payload;
      return api;
    },
    eq(col: string, value: unknown) {
      state.filters.push((row) => row[col] === value);
      return api;
    },
    ilike(col: string, value: unknown) {
      const needle = String(value ?? "").toLowerCase();
      state.filters.push((row) => String(row[col] ?? "").toLowerCase() === needle);
      return api;
    },
    in(col: string, values: unknown[]) {
      const set = new Set(values);
      state.filters.push((row) => set.has(row[col]));
      return api;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.order = { col, asc: opts?.ascending !== false };
      return api;
    },
    limit(n: number) {
      state.limit = n;
      return api;
    },
    maybeSingle: async () => exec(true),
    single: async () => {
      const result = await exec(true);
      if (result.error) return result;
      if (!result.data) return { data: null, error: { message: "not found", code: "PGRST116" } };
      return result;
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return exec(false).then(resolve, reject);
    },
  };

  async function exec(single: boolean) {
    try {
      if (state.mode === "insert") {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload!];
        const inserted = rows.map((row) => db.insert(table, row));
        return single
          ? { data: inserted[0], error: null }
          : { data: inserted, error: null };
      }
      if (state.mode === "update") {
        const rows = (db.tables[table] ?? []).filter((row) => state.filters.every((f) => f(row)));
        for (const row of rows) Object.assign(row, state.payload);
        return { data: rows.map((r) => ({ id: r.id })), error: null, count: rows.length };
      }
      let rows = [...(db.tables[table] ?? [])].filter((row) => state.filters.every((f) => f(row)));
      if (state.order) {
        const { col, asc } = state.order;
        rows.sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (state.limit != null) rows = rows.slice(0, state.limit);
      if (state.head) return { data: null, error: null, count: rows.length };
      return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "error";
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code ?? "") : "";
      return { data: null, error: { message, code: code || undefined } };
    }
  }

  return api;
}

export function seedBrand(db: MemorySocialDb, blocked: string[] = [], forbidden: string[] = []) {
  db.insert("social_brand_profiles", {
    owner_id: "owner-1",
    identity: {},
    audiences: [],
    voice: { tone: [], blocked_phrases: blocked, forbidden_claims: forbidden },
    visual: { colors: [], priorities: [] },
    goals: [],
    competitors: [],
    source_material: [],
    products: [],
    content_pillars: [],
    rules: [],
  });
  db.insert("social_automation_settings", {
    owner_id: "owner-1",
    shadow_mode: true,
    autonomy_level: "SUPERVISED",
  });
}
