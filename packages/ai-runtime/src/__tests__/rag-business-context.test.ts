// Validates the RAG ingestion/retrieval mechanism built to fill the gap
// confirmed live: the remote server has POST /v1/rag/query but no ingestion
// endpoint. Mocks the Supabase client + remote embeddings call; the
// critical property under test is TENANT ISOLATION, since that's a
// correctness requirement with real consequences if it regresses.
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/rag-business-context.test.ts

import assert from "node:assert/strict";
import { chunkBusinessContext, ingestBusinessContext, retrieveBusinessContext, RemoteEmbeddingsClient, type BusinessContextSupabaseClient } from "../index.ts";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

/** Deterministic fake embedding: hashes the text into a small, stable vector so
 * near-identical text yields high cosine similarity, and different content doesn't. */
function fakeEmbed(text: string): number[] {
  const vec = new Array(16).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 16] += text.charCodeAt(i);
  }
  return vec;
}

function makeInMemorySupabase(): { client: BusinessContextSupabaseClient; rows: () => Array<Record<string, unknown>> } {
  let rows: Array<Record<string, unknown> & { tenant_id: string; business_id: string }> = [];
  const client: BusinessContextSupabaseClient = {
    from: () => ({
      upsert: async (row) => {
        rows.push(row as Record<string, unknown> & { tenant_id: string; business_id: string });
        return { error: null };
      },
      select: () => ({
        eq: (col1: string, val1: string) => ({
          eq: async (col2: string, val2: string) => ({
            data: rows.filter((r) => (r as Record<string, unknown>)[col1] === val1 && (r as Record<string, unknown>)[col2] === val2) as never,
            error: null,
          }),
        }),
      }),
      delete: () => ({
        eq: (col1: string, val1: string) => ({
          eq: async (col2: string, val2: string) => {
            rows = rows.filter((r) => !((r as Record<string, unknown>)[col1] === val1 && (r as Record<string, unknown>)[col2] === val2));
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { client, rows: () => rows };
}

function testChunking() {
  const chunks = chunkBusinessContext("Para one.\n\nPara two is here.\n\n\nPara three.");
  assert.deepEqual(chunks, ["Para one.", "Para two is here.", "Para three."]);

  const longParagraph = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const longChunks = chunkBusinessContext(longParagraph, 100);
  assert.ok(longChunks.length > 1, "an overlong paragraph must be split into multiple bounded chunks");
  assert.ok(longChunks.every((c) => c.length <= 130), "chunks must stay reasonably close to the requested bound");

  assert.deepEqual(chunkBusinessContext("   \n\n  "), []);
  console.log("rag-business-context.test.ts: chunkBusinessContext splits on paragraphs and bounds overlong ones — PASS");
}

async function testIngestAndRetrieveRoundTrip() {
  const { client } = makeInMemorySupabase();
  const embeddings = new RemoteEmbeddingsClient({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch((url, init) => {
      const body = JSON.parse(init!.body as string) as { input: string };
      return new Response(JSON.stringify({ model: "nomic-embed-text", embeddings: [fakeEmbed(body.input)], dimensions: 16 }), { status: 200 });
    }),
  });

  const ingestResult = await ingestBusinessContext(client, embeddings, {
    tenantId: "tenant-a",
    businessId: "biz-a",
    content: "Water Co sells eco-friendly reusable water bottles online.\n\nWater Co has exactly 3 branches in Jaipur.",
  });
  assert.equal(ingestResult.ok, true);

  const results = await retrieveBusinessContext(client, embeddings, {
    tenantId: "tenant-a",
    businessId: "biz-a",
    query: "Water Co has exactly 3 branches",
  });
  assert.ok(results.length >= 1);
  assert.ok(results[0]!.content.includes("3 branches"), `expected the branches fact to rank highest, got: ${JSON.stringify(results)}`);
  console.log("rag-business-context.test.ts: ingest -> retrieve finds the real stored fact — PASS");
}

async function testTenantIsolation() {
  const { client } = makeInMemorySupabase();
  const embeddings = new RemoteEmbeddingsClient({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch((url, init) => {
      const body = JSON.parse(init!.body as string) as { input: string };
      return new Response(JSON.stringify({ model: "nomic-embed-text", embeddings: [fakeEmbed(body.input)], dimensions: 16 }), { status: 200 });
    }),
  });

  await ingestBusinessContext(client, embeddings, {
    tenantId: "tenant-a",
    businessId: "biz-a",
    content: "Business Alpha has exactly 3 branches.",
  });
  await ingestBusinessContext(client, embeddings, {
    tenantId: "tenant-b",
    businessId: "biz-b",
    content: "Business Beta has exactly 9 branches.",
  });

  const resultsForA = await retrieveBusinessContext(client, embeddings, {
    tenantId: "tenant-a",
    businessId: "biz-a",
    query: "How many branches?",
  });
  const resultsForB = await retrieveBusinessContext(client, embeddings, {
    tenantId: "tenant-b",
    businessId: "biz-b",
    query: "How many branches?",
  });

  assert.ok(resultsForA.every((r) => r.content.includes("Alpha")), `tenant A must never see tenant B's data: ${JSON.stringify(resultsForA)}`);
  assert.ok(resultsForB.every((r) => r.content.includes("Beta")), `tenant B must never see tenant A's data: ${JSON.stringify(resultsForB)}`);

  // Cross-tenant probe: asking business A's question while impersonating a
  // mismatched (tenant, business) pair must return nothing from either real business.
  const crossProbe = await retrieveBusinessContext(client, embeddings, {
    tenantId: "tenant-a",
    businessId: "biz-b", // wrong business for this tenant
    query: "How many branches?",
  });
  assert.equal(crossProbe.length, 0, "mismatched tenant/business pair must retrieve nothing, not fall back to any real tenant's data");
  console.log("rag-business-context.test.ts: tenant A and tenant B retrieval never cross-contaminate — PASS");
}

async function testIngestRejectsMissingIds() {
  const { client } = makeInMemorySupabase();
  const embeddings = new RemoteEmbeddingsClient({ apiUrl: "https://local.example", apiKey: "test-only" });
  const result = await ingestBusinessContext(client, embeddings, { tenantId: "", businessId: "", content: "test" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "tenant_and_business_id_required");
  console.log("rag-business-context.test.ts: ingest refuses to run without both tenant_id and business_id — PASS");
}

async function run() {
  testChunking();
  await testIngestAndRetrieveRoundTrip();
  await testTenantIsolation();
  await testIngestRejectsMissingIds();
  console.log("rag-business-context.test.ts: ALL PASS");
}

run();
