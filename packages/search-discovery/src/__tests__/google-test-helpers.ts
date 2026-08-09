// Shared test-only fakes for the Google Search/GA4 integration tests in
// this directory. Not itself a test — nothing here is executed by `npm
// test`/the test scripts directly; it's imported by the *.test.ts files
// alongside it.

export interface FakeRow {
  [key: string]: unknown;
}

/**
 * Minimal in-memory fake of the one Supabase table shape our new
 * search_google_connections repository functions touch:
 * .select().eq().maybeSingle()/.single(), .upsert(patch, {onConflict}).select().single(),
 * .update(patch).eq() (awaited directly, or chained with .select().single()).
 * Deliberately narrow (one table) rather than a general query engine — the
 * package under test only ever talks to this one table plus the shared
 * audit/approvals tables, which are exercised through the higher-level
 * runtime tests, not here.
 */
export function createFakeGoogleConnectionsDb(initialRows: FakeRow[] = []) {
  const rows: FakeRow[] = initialRows.map((r) => ({ ...r }));

  function from(table: string) {
    if (table !== "search_google_connections") {
      throw new Error(`createFakeGoogleConnectionsDb: unexpected table "${table}"`);
    }
    return {
      select() {
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return chain;
          },
          async maybeSingle() {
            const match = rows.find((r) => filters.every(([c, v]) => r[c] === v));
            return { data: match ?? null, error: null };
          },
          async single() {
            const match = rows.find((r) => filters.every(([c, v]) => r[c] === v));
            if (!match) return { data: null, error: { message: "row not found" } };
            return { data: match, error: null };
          },
        };
        return chain;
      },
      upsert(patch: FakeRow, opts: { onConflict?: string } = {}) {
        return {
          select() {
            return {
              async single() {
                const keyCols = (opts.onConflict ?? "id").split(",");
                const idx = rows.findIndex((r) => keyCols.every((k) => r[k] === patch[k]));
                if (idx >= 0) {
                  rows[idx] = { ...rows[idx], ...patch };
                  return { data: rows[idx], error: null };
                }
                const row: FakeRow = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), ...patch };
                rows.push(row);
                return { data: row, error: null };
              },
            };
          },
        };
      },
      update(patch: FakeRow) {
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            const idx = rows.findIndex((r) => filters.every(([c, v]) => r[c] === v));
            if (idx >= 0) rows[idx] = { ...rows[idx], ...patch };
            const result: any = { data: null, error: null };
            result.select = () => ({
              async single() {
                return idx >= 0 ? { data: rows[idx], error: null } : { data: null, error: { message: "row not found" } };
              },
            });
            return result;
          },
        };
        return chain;
      },
    };
  }

  return { from, rows: () => rows.map((r) => ({ ...r })) };
}

/**
 * A tiny in-memory SecretVault double: store()/retrieve()/revoke() over a
 * plain Map, so provider tests never need a real byok vault or database —
 * only the *shape* (opaque ref in, plaintext out) matters here.
 */
export function createFakeVault(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  let nextId = Object.keys(seed).length + 1;
  return {
    async store(plaintext: string) {
      const ref = `vault-ref-${nextId++}`;
      store.set(ref, plaintext);
      return ref;
    },
    async retrieve(ref: string) {
      return store.get(ref) ?? null;
    },
    async revoke(ref: string) {
      store.delete(ref);
    },
    _size: () => store.size,
  };
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export interface FetchHandler {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
}

/**
 * Installs a routed fetch mock for the duration of a test. Every provider
 * in this feature calls the real Google endpoints via the global `fetch` —
 * there is no injected HTTP client to swap out — so tests intercept at
 * that boundary instead. Always call `.restore()` (ideally in a finally)
 * so a failing test doesn't leak a patched global into the next one.
 */
export function installFetchMock(handlers: FetchHandler[]) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calls.push({ url, init });
    const handler = handlers.find((h) => h.match(url, init));
    if (!handler) throw new Error(`installFetchMock: no handler matched ${url}`);
    return handler.respond(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
