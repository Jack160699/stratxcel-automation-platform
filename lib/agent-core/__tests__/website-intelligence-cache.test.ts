// Run with: node --experimental-strip-types lib/agent-core/__tests__/website-intelligence-cache.test.ts
import assert from "node:assert/strict";
import { runWebsiteIntelligencePipelineCached } from "../website-intelligence-cache.ts";

type Row = Record<string, unknown>;

function fakeSupabase(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  return {
    rows,
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const row = rows.find((r) => r[column] === value);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: Row) {
          const idx = rows.findIndex((r) => r.normalized_url === row.normalized_url);
          if (idx >= 0) rows[idx] = row;
          else rows.push(row);
          return { error: null };
        },
      };
    },
  };
}

async function run() {
  // Cache miss -> calls the real (here, fake) pipeline exactly once, stores the result.
  {
    const supabase = fakeSupabase();
    let pipelineCalls = 0;
    const fakePipeline = async () => {
      pipelineCalls += 1;
      return { business: "real-fresh-result" } as never;
    };
    const result = await runWebsiteIntelligencePipelineCached(supabase, "https://Example.com", {}, fakePipeline);
    assert.equal(result.cacheHit, false);
    assert.equal(pipelineCalls, 1);
    assert.equal(supabase.rows.length, 1);
    assert.equal(supabase.rows[0]!.normalized_url, "https://example.com"); // normalized (trim + lowercase)
  }

  // Fresh cache hit -> never calls the pipeline at all.
  {
    const supabase = fakeSupabase([
      { normalized_url: "https://example.com", intelligence: { business: "cached-result" }, expires_at: new Date(Date.now() + 60_000).toISOString() },
    ]);
    let pipelineCalls = 0;
    const fakePipeline = async () => {
      pipelineCalls += 1;
      return { business: "should-never-be-called" } as never;
    };
    const result = await runWebsiteIntelligencePipelineCached(supabase, "https://example.com", {}, fakePipeline);
    assert.equal(result.cacheHit, true);
    assert.equal(pipelineCalls, 0, "a fresh cache hit must never call the real pipeline");
    assert.deepEqual(result.intelligence, { business: "cached-result" });
  }

  // Expired cache row -> honestly treated as a miss, real pipeline is called again.
  {
    const supabase = fakeSupabase([
      { normalized_url: "https://example.com", intelligence: { business: "stale-result" }, expires_at: new Date(Date.now() - 60_000).toISOString() },
    ]);
    let pipelineCalls = 0;
    const fakePipeline = async () => {
      pipelineCalls += 1;
      return { business: "real-fresh-result-2" } as never;
    };
    const result = await runWebsiteIntelligencePipelineCached(supabase, "https://example.com", {}, fakePipeline);
    assert.equal(result.cacheHit, false, "an expired row must never be returned as a hit");
    assert.equal(pipelineCalls, 1);
    assert.deepEqual(result.intelligence, { business: "real-fresh-result-2" });
  }

  // A cache read failure falls through to a real fresh run rather than throwing.
  {
    const supabase = {
      from(_table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    throw new Error("db_unavailable");
                  },
                };
              },
            };
          },
          async upsert() {
            return { error: null };
          },
        };
      },
    };
    let pipelineCalls = 0;
    const fakePipeline = async () => {
      pipelineCalls += 1;
      return { business: "real-result-despite-cache-failure" } as never;
    };
    const result = await runWebsiteIntelligencePipelineCached(supabase as never, "https://example.com", {}, fakePipeline);
    assert.equal(pipelineCalls, 1, "a cache read failure must never block the real result");
    assert.deepEqual(result.intelligence, { business: "real-result-despite-cache-failure" });
  }

  console.log("website-intelligence-cache.test.ts (lib/agent-core): ALL PASS");
}

run();
