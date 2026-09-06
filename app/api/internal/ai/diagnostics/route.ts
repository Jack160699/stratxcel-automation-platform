import { NextResponse, type NextRequest } from "next/server";
import {
  LocalAITextProvider,
  LocalAIImageProvider,
  LOCAL_AI_CODING_MODEL_SENTINEL,
  probeLocalAIReadiness,
  ingestBusinessContext,
  retrieveBusinessContext,
  RemoteEmbeddingsClient,
  ImageMediaRuntime,
  type BusinessContextSupabaseClient,
} from "@stratxcel/ai-runtime";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { probeLocalAIConnection } from "@/lib/local-ai/connection";

/**
 * Internal-only diagnostic endpoint for the remote local AI server
 * integration. NOT a customer-facing feature — exists so the connection can
 * be re-verified via real production round-trips (this route runs inside
 * the actual deployed server, reading LOCAL_AI_API_URL/LOCAL_AI_API_KEY from
 * the real production environment) without ever needing to re-extract or
 * re-print the credential itself. Gated on a dedicated, self-generated
 * AI_DIAGNOSTICS_SECRET — never CRON_SECRET, never a customer/tenant token.
 *
 * No tenant context is required or accepted: every probe here uses synthetic
 * inputs, never real customer data.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.AI_DIAGNOSTICS_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

type Action = "health" | "ready" | "models" | "chat" | "chat_with_tools" | "code" | "image" | "image_runtime" | "raw_image" | "raw_image_fetch" | "research" | "embeddings" | "rag_query" | "rag_ingest" | "rag_retrieve" | "raw_pair" | "probe_connection";

async function callRemoteJson(path: string, init?: RequestInit) {
  const apiUrl = process.env.LOCAL_AI_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.LOCAL_AI_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, status: 0, body: { detail: "local_ai_not_configured" } };
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text().catch(() => "");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: response.ok, status: response.status, body };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let action: Action;
  let payload: Record<string, unknown> = {};
  try {
    const json = (await req.json()) as { action?: Action; payload?: Record<string, unknown> };
    if (!json.action) throw new Error("missing action");
    action = json.action;
    payload = json.payload ?? {};
  } catch {
    return NextResponse.json({ error: "expected JSON body { action, payload? }" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    switch (action) {
      case "health":
        return NextResponse.json({ ...(await callRemoteJson("/v1/health")), latencyMs: Date.now() - startedAt });
      case "ready":
        return NextResponse.json({ ...(await callRemoteJson("/v1/ready")), latencyMs: Date.now() - startedAt });
      case "models":
        return NextResponse.json({ ...(await callRemoteJson("/v1/models")), latencyMs: Date.now() - startedAt });

      case "chat": {
        const provider = new LocalAITextProvider();
        const result = await provider.complete({
          model: "auto",
          messages: [{ role: "user", content: typeof payload.prompt === "string" ? payload.prompt : "Say hello in five words or fewer." }],
          reasoningLevel: "low",
          timeoutMs: 45_000,
        });
        return NextResponse.json({ ok: true, text: result.text, usage: result.usage, providerRequestId: result.providerRequestId, latencyMs: Date.now() - startedAt });
      }

      case "chat_with_tools": {
        // Verifies whether /v1/chat actually implements OpenAI-style function
        // calling (returns tool_calls) or just ignores/free-texts around a
        // `tools` schema — required to know before ANY tool-calling-heavy
        // task class (e.g. GENERAL_SPECIALIST, used by Social Copilot's
        // 5-8-round agentic loop) can safely be promoted to local-primary.
        const provider = new LocalAITextProvider();
        const result = await provider.complete({
          model: "auto",
          messages: [{ role: "user", content: "What is today's weather in Jaipur? Use the get_weather tool." }],
          tools: [
            {
              name: "get_weather",
              description: "Get the current weather for a city.",
              parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
            },
          ],
          reasoningLevel: "low",
          timeoutMs: 45_000,
        });
        return NextResponse.json({
          ok: true,
          text: result.text,
          toolCallCount: result.toolCalls.length,
          toolCalls: result.toolCalls,
          latencyMs: Date.now() - startedAt,
        });
      }

      case "code": {
        const provider = new LocalAITextProvider();
        const result = await provider.complete({
          model: LOCAL_AI_CODING_MODEL_SENTINEL,
          messages: [{ role: "user", content: typeof payload.prompt === "string" ? payload.prompt : "Write a one-line TypeScript add(a,b) function." }],
          reasoningLevel: "medium",
          timeoutMs: 60_000,
        });
        return NextResponse.json({ ok: true, text: result.text, latencyMs: Date.now() - startedAt });
      }

      case "image": {
        const provider = new LocalAIImageProvider();
        const result = await provider.generate({
          prompt: typeof payload.prompt === "string" ? payload.prompt : "a tiny minimal grey circle icon",
          quality: (payload.quality as "fast" | "quality" | "premium") ?? "fast",
          timeoutMs: 120_000,
        });
        return NextResponse.json({
          outcome: result.outcome,
          reason: result.reason,
          model: result.model,
          candidateCount: result.candidates.length,
          firstCandidateBytesApprox: result.candidates[0] ? Math.round((result.candidates[0].uri.length * 3) / 4) : 0,
          qualityScore: result.candidates[0]?.qualityScore,
          qualityGatePassed: result.candidates[0]?.qualityGatePassed,
          latencyMs: Date.now() - startedAt,
        });
      }

      case "probe_connection": {
        // Local AI admin-connect mission, 2026-09-06 -- exercises the exact
        // production probeLocalAIConnection() the admin health-check route
        // calls, against the REAL currently-configured LOCAL_AI_API_URL/
        // LOCAL_AI_API_KEY, so the tunnel-down/api-error/connected
        // classification can be verified live rather than only via
        // fetchImpl-mocked unit tests.
        const apiUrl = process.env.LOCAL_AI_API_URL;
        const apiKey = process.env.LOCAL_AI_API_KEY;
        if (!apiUrl || !apiKey) return NextResponse.json({ error: "local_ai_not_configured" }, { status: 400 });
        const probe = await probeLocalAIConnection({ apiUrl, apiKey });
        return NextResponse.json({ ...probe, latencyMs: Date.now() - startedAt });
      }

      case "raw_pair": {
        // Local AI admin-connect mission, 2026-09-06 -- unfiltered pass-through
        // to /v1/pair (no Bearer header: pairing is what OBTAINS the api key
        // in the first place, so a not-yet-paired admin must be able to call
        // this with none) so the real accepted request/response shape
        // (field name for the code, the shape of a successful machine_api_key
        // response, and the shape of an invalid/expired-code error) can be
        // discovered from the server's own behavior, never guessed.
        const apiUrl = process.env.LOCAL_AI_API_URL?.replace(/\/+$/, "");
        if (!apiUrl) return NextResponse.json({ error: "local_ai_url_not_configured" }, { status: 400 });
        const response = await fetch(`${apiUrl}/v1/pair`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await response.text().catch(() => "");
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text.slice(0, 500) };
        }
        return NextResponse.json({ ok: response.ok, status: response.status, body, latencyMs: Date.now() - startedAt });
      }

      case "raw_image": {
        // Local AI image-quality repair mission, 2026-09-06 -- unfiltered
        // pass-through to /v1/images/generate (bypasses LocalImageGenerateRequest's
        // typed {prompt, quality} shape entirely) so the REAL accepted request
        // schema can be discovered from the server's own validation errors
        // (steps/seed/negative_prompt/width/height/etc.), never guessed.
        return NextResponse.json({
          ...(await callRemoteJson("/v1/images/generate", { method: "POST", body: JSON.stringify(payload) })),
          latencyMs: Date.now() - startedAt,
        });
      }

      case "raw_image_fetch": {
        // Local AI image-quality repair mission, 2026-09-06 -- retrieves the
        // actual PNG bytes for a raw_image result's relative `url` (same
        // authenticated second GET LocalAIImageProvider does internally) so
        // a real generated candidate can be visually inspected, without
        // needing a full ImageMediaRuntime/storage round trip for a
        // throwaway diagnostic probe.
        const apiUrl = process.env.LOCAL_AI_API_URL?.replace(/\/+$/, "");
        const apiKey = process.env.LOCAL_AI_API_KEY;
        const path = typeof payload.path === "string" ? payload.path : "";
        if (!apiUrl || !apiKey || !path) return NextResponse.json({ error: "local_ai_not_configured_or_missing_path" }, { status: 400 });
        const imageUrl = path.startsWith("http") ? path : `${apiUrl}${path}`;
        const imgRes = await fetch(imageUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!imgRes.ok) return NextResponse.json({ ok: false, status: imgRes.status }, { status: 502 });
        const mimeType = imgRes.headers.get("content-type") ?? "image/png";
        const bytes = Buffer.from(await imgRes.arrayBuffer());
        return NextResponse.json({ ok: true, mimeType, sizeBytes: bytes.length, base64: bytes.toString("base64"), latencyMs: Date.now() - startedAt });
      }

      case "image_runtime": {
        // Exercises the REAL ImageMediaRuntime.generate() boundary that both
        // real Social Autopilot production paths call — not the standalone
        // LocalAIImageProvider directly — to prove the actual wired
        // integration, not just the underlying client.
        const runtime = new ImageMediaRuntime({ requireStorageForOperational: false });
        const result = await runtime.generate({
          tenantId: (payload.tenant_id as string) || "diagnostics-probe",
          prompt: typeof payload.prompt === "string" ? payload.prompt : "a minimal flat-style icon for a local coffee shop, warm colors",
          tier: (payload.tier as "fast" | "standard" | "premium") ?? "fast",
        });
        return NextResponse.json({
          outcome: result.outcome,
          provider: result.provider,
          model: result.model,
          reason: result.reason,
          candidateCount: result.candidates.length,
          qualityScore: result.candidates[0]?.qualityScore,
          qualityGatePassed: result.candidates[0]?.qualityGatePassed,
          approxBytes: result.candidates[0] ? Math.round((result.candidates[0].uri.length * 3) / 4) : 0,
          latencyMs: Date.now() - startedAt,
        });
      }

      case "research":
        return NextResponse.json({
          ...(await callRemoteJson("/v1/research/reason", {
            method: "POST",
            body: JSON.stringify(
              Object.keys(payload).length > 0
                ? payload
                : { task_type: "general", user_input: "In one sentence, what is a Local Growth Score for a small local business?" },
            ),
          })),
          latencyMs: Date.now() - startedAt,
        });

      case "embeddings":
        return NextResponse.json({
          ...(await callRemoteJson("/v1/embeddings", {
            method: "POST",
            body: JSON.stringify({ input: typeof payload.input === "string" ? payload.input : "StratXcel diagnostic embeddings probe." }),
          })),
          latencyMs: Date.now() - startedAt,
        });

      case "rag_ingest": {
        const tenantId = payload.tenant_id as string | undefined;
        const businessId = (payload.business_id as string | undefined) ?? tenantId;
        const content = payload.content as string | undefined;
        if (!tenantId || !content) return NextResponse.json({ error: "tenant_id and content required" }, { status: 400 });
        const service = createSupabaseServiceClient() as unknown as BusinessContextSupabaseClient;
        const embeddings = new RemoteEmbeddingsClient();
        const result = await ingestBusinessContext(service, embeddings, { tenantId, businessId: businessId!, content, source: "diagnostics" });
        return NextResponse.json({ ...result, latencyMs: Date.now() - startedAt });
      }

      case "rag_retrieve": {
        const tenantId = payload.tenant_id as string | undefined;
        const businessId = (payload.business_id as string | undefined) ?? tenantId;
        const query = (payload.query as string | undefined) ?? "What does this business do?";
        if (!tenantId) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
        const service = createSupabaseServiceClient() as unknown as BusinessContextSupabaseClient;
        const embeddings = new RemoteEmbeddingsClient();
        const chunks = await retrieveBusinessContext(service, embeddings, { tenantId, businessId: businessId!, query, topK: 5 });
        return NextResponse.json({ ok: true, chunks, latencyMs: Date.now() - startedAt });
      }

      case "rag_query":
        return NextResponse.json({
          ...(await callRemoteJson("/v1/rag/query", {
            method: "POST",
            body: JSON.stringify({
              query: payload.query ?? "What does this business sell?",
              tenant_id: payload.tenant_id ?? "diagnostics-probe-tenant",
              business_id: payload.business_id ?? "diagnostics-probe-business",
            }),
          })),
          latencyMs: Date.now() - startedAt,
        });

      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "diagnostic_failed", latencyMs: Date.now() - startedAt },
      { status: 502 },
    );
  }
}

/** Cheap liveness/readiness read, no remote calls that cost GPU time. */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const probe = await probeLocalAIReadiness({ apiUrl: process.env.LOCAL_AI_API_URL, apiKey: process.env.LOCAL_AI_API_KEY });
  return NextResponse.json(probe);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;
