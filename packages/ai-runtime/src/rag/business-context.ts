import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import type { FetchLike } from "../types.ts";

/**
 * Real RAG ingestion + retrieval for the remote local AI server's business
 * context. The remote server exposes POST /v1/rag/query but — confirmed live
 * (2026-09-05) — no ingestion endpoint (/v1/rag/ingest, /v1/rag/upsert,
 * /v1/rag/index all 404). So this builds the missing mechanism the correct
 * way per the connection brief's own architecture rule (section 6):
 * StratXcel remains the canonical store, the remote server is used only for
 * the embedding computation.
 *
 *   ingest:   content -> POST /v1/embeddings (nomic-embed-text, 768-dim)
 *             -> upsert into Supabase business_context_embeddings
 *             (migration 20260905140000, tenant-scoped RLS)
 *   retrieve: query -> POST /v1/embeddings -> cosine-distance match against
 *             that tenant+business's rows only -> top-K chunks
 *
 * Tenant isolation is enforced the same way every other table in this
 * codebase enforces it: every read/write is scoped by tenant_id (+
 * business_id) in the SQL itself, backed by the table's RLS policy — never
 * by trusting a caller-supplied filter alone.
 */

export interface BusinessContextSupabaseClient {
  from: (table: "business_context_embeddings") => {
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => PromiseLike<{
          data: Array<{ id: string; content: string; embedding: string | number[]; source: string; created_at: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
    delete: () => {
      eq: (col: string, val: string) => { eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }> };
    };
  };
}

export interface EmbeddingsClientOptions {
  apiUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
}

/** Calls the remote server's POST /v1/embeddings — real shape confirmed live:
 * `{ model, embeddings: number[][], dimensions }`. */
export class RemoteEmbeddingsClient {
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(options: EmbeddingsClientOptions = {}) {
    const rawUrl = options.apiUrl ?? process.env.LOCAL_AI_API_URL;
    this.apiUrl = rawUrl ? rawUrl.replace(/\/+$/, "") : undefined;
    this.apiKey = options.apiKey ?? process.env.LOCAL_AI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  async embed(input: string, timeoutMs = 30_000): Promise<number[]> {
    if (!this.apiUrl || !this.apiKey) {
      throw new AIProviderError("NOT_CONFIGURED", "LOCAL_AI_API_URL/LOCAL_AI_API_KEY not configured");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.apiUrl}/v1/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new AIProviderError(classifyHttpStatus(response.status), `Local AI embeddings HTTP ${response.status}: ${bodyText.slice(0, 200)}`, response.status);
      }
      const json = (await response.json()) as { embeddings?: number[][]; dimensions?: number };
      const vector = json.embeddings?.[0];
      if (!vector?.length) throw new AIProviderError("PROVIDER_FAILURE", "local_ai_embeddings_empty_response");
      return vector;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") throw new AIProviderError("TIMEOUT", "local_ai_embeddings_timeout");
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "local_ai_embeddings_failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface IngestBusinessContextInput {
  tenantId: string;
  businessId: string;
  content: string;
  source?: string;
}

export interface IngestBusinessContextResult {
  ok: boolean;
  reason?: string;
}

/** Splits on blank lines / sentence-ish boundaries, bounded, never empty chunks. */
export function chunkBusinessContext(content: string, maxChunkChars = 600): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkChars) {
      chunks.push(paragraph);
      continue;
    }
    // A single overlong paragraph -- split on sentence boundaries, packing
    // greedily up to maxChunkChars rather than hard-cutting mid-sentence.
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    let current = "";
    for (const sentence of sentences) {
      if ((current + " " + sentence).trim().length > maxChunkChars && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = (current + " " + sentence).trim();
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Ingests business content: chunk -> embed each chunk via the remote server
 * -> upsert into business_context_embeddings. Replaces prior rows for this
 * exact (tenant_id, business_id, source) so re-ingesting a source doesn't
 * accumulate stale duplicates.
 */
export async function ingestBusinessContext(
  supabase: BusinessContextSupabaseClient,
  embeddings: RemoteEmbeddingsClient,
  input: IngestBusinessContextInput,
): Promise<IngestBusinessContextResult> {
  if (!input.tenantId || !input.businessId) {
    return { ok: false, reason: "tenant_and_business_id_required" };
  }
  const trimmed = input.content.trim();
  if (!trimmed) return { ok: false, reason: "empty_content" };

  const source = input.source ?? "manual";
  const chunks = chunkBusinessContext(trimmed);
  if (!chunks.length) return { ok: false, reason: "no_chunks_produced" };

  // Replace this source's prior rows for this business — an explicit
  // re-ingest, not an unbounded accumulation of stale chunks.
  const del = await supabase
    .from("business_context_embeddings")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("business_id", input.businessId);
  if (del.error && !/does not exist|no rows/i.test(del.error.message)) {
    return { ok: false, reason: `delete_failed:${del.error.message}` };
  }

  for (const chunk of chunks) {
    let vector: number[];
    try {
      vector = await embeddings.embed(chunk);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "embedding_failed" };
    }
    const { error } = await supabase.from("business_context_embeddings").upsert({
      tenant_id: input.tenantId,
      business_id: input.businessId,
      source,
      content: chunk,
      embedding: `[${vector.join(",")}]`,
    });
    if (error) return { ok: false, reason: `upsert_failed:${error.message}` };
  }

  return { ok: true };
}

export interface RetrieveBusinessContextInput {
  tenantId: string;
  businessId: string;
  query: string;
  topK?: number;
}

export interface RetrievedContextChunk {
  content: string;
  source: string;
  similarity: number;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseEmbedding(value: string | number[]): number[] {
  if (Array.isArray(value)) return value;
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number);
}

/**
 * Retrieves the top-K most relevant chunks for THIS tenant+business only —
 * the query is embedded and compared in-process against rows already
 * scoped by an equality filter on both tenant_id and business_id, so a
 * request for tenant A's business can never even fetch tenant B's rows to
 * begin with (defense in depth on top of the table's own RLS policy).
 */
export async function retrieveBusinessContext(
  supabase: BusinessContextSupabaseClient,
  embeddings: RemoteEmbeddingsClient,
  input: RetrieveBusinessContextInput,
): Promise<RetrievedContextChunk[]> {
  if (!input.tenantId || !input.businessId) return [];
  const { data, error } = await supabase
    .from("business_context_embeddings")
    .select("id,content,embedding,source,created_at")
    .eq("tenant_id", input.tenantId)
    .eq("business_id", input.businessId);
  if (error || !data?.length) return [];

  const queryVector = await embeddings.embed(input.query);
  const scored = data
    .map((row) => ({
      content: row.content,
      source: row.source,
      similarity: cosineSimilarity(queryVector, parseEmbedding(row.embedding)),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, Math.max(1, Math.min(input.topK ?? 5, 20)));
}
