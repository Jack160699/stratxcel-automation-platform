import { createDevEncryptedVault } from "@stratxcel/byok";
import type { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * StratXcel Admin -> Local AI connection interface (2026-09-06).
 *
 * Persists and re-verifies the pairing exchange with the owner's remote,
 * self-hosted "StratXcel Unified Local AI Server" (packages/ai-runtime/src/
 * providers/local-ai.ts: a FastAPI service, paired via a one-time
 * POST /v1/pair exchange that hands back a long-lived machine_api_key).
 *
 * Deliberately does NOT touch LocalAITextProvider/LocalAIImageProvider or
 * their LOCAL_AI_API_URL/LOCAL_AI_API_KEY env vars -- those remain the
 * real, unchanged production inference path (revenue-critical: Social
 * Autopilot image generation, WhatsApp agent). This module is the missing
 * admin-facing PERSISTENCE and RE-VERIFICATION layer that never previously
 * existed: before this, the pairing exchange was a one-off manual script
 * run once, with no stored record, no re-pairing UI, and no automatic
 * health-check. Re-pairing here updates the stored connection record an
 * admin can inspect; promoting a freshly-paired key into the live env vars
 * is still the one manual step this module does not perform (a Vercel env
 * var change requires a redeploy to take effect, which this module has no
 * business triggering on every health check).
 *
 * The real, empirically-confirmed server contract this module calls
 * against (see app/api/internal/ai/diagnostics/route.ts's raw_pair probe,
 * run live against ai.stratxcel.in on 2026-09-06):
 *   POST /v1/pair  { pairing_code: string }  (no Authorization header --
 *     pairing is what OBTAINS the key)
 *     -> 422 { detail: [{ loc: ["body","pairing_code"], msg, ... }] } when
 *        the field is missing
 *     -> 400 { detail: "Pairing code has expired. Please generate a new
 *        one from the dashboard." } for an unknown/expired code (the
 *        server does not distinguish "never existed" from "expired" in
 *        this message -- surfaced to the admin verbatim, never reworded
 *        into an invented distinction)
 *     -> 200 (success shape not yet empirically observed -- no valid code
 *        was available during this pass. Parsed leniently below: accepts
 *        machine_api_key/api_key/key and machine_name/name/hostname,
 *        never assumes one exact shape, and the full raw body is stored
 *        verbatim in raw_pair_response so a real pairing can be diagnosed
 *        from stored data alone if the assumed field names are ever wrong.)
 *   GET /v1/ready, GET /v1/health, GET /v1/models -- already-documented,
 *     already-used-live probes (packages/ai-runtime/src/health/readiness.ts)
 *   Cloudflare tunnel-down (the physical machine offline or the tunnel
 *     process not running) was directly reproduced live during this pass:
 *     HTTP 530 with a Cloudflare-branded HTML error page ("Cloudflare
 *     Tunnel error"), never a StratXcel API response -- distinguished
 *     from a real API-level error below so "Tunnel status" and "API
 *     status" can be reported as the two genuinely independent signals
 *     the admin UI asks for.
 */

export type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type LocalAIConnectionStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";

export interface LocalAIConnectionRow {
  id: string;
  machine_name: string | null;
  machine_id: string | null;
  api_url: string;
  encrypted_token_ref: string;
  status: LocalAIConnectionStatus;
  tunnel_reachable: boolean;
  api_reachable: boolean;
  model_available: boolean;
  model_status: Record<string, unknown>;
  last_paired_at: string | null;
  last_seen_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  is_active: boolean;
}

/** Public-safe projection -- never includes encrypted_token_ref or any credential material. */
export interface LocalAIConnectionSummary {
  id: string;
  machineName: string | null;
  machineId: string | null;
  apiUrl: string;
  status: LocalAIConnectionStatus;
  tunnelReachable: boolean;
  apiReachable: boolean;
  modelAvailable: boolean;
  modelStatus: Record<string, unknown>;
  lastPairedAt: string | null;
  lastSeenAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

function toSummary(row: LocalAIConnectionRow): LocalAIConnectionSummary {
  return {
    id: row.id,
    machineName: row.machine_name,
    machineId: row.machine_id,
    apiUrl: row.api_url,
    status: row.status,
    tunnelReachable: row.tunnel_reachable,
    apiReachable: row.api_reachable,
    modelAvailable: row.model_available,
    modelStatus: row.model_status ?? {},
    lastPairedAt: row.last_paired_at,
    lastSeenAt: row.last_seen_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
  };
}

export type FetchLike = typeof fetch;

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Cloudflare's own tunnel-down error page -- never a StratXcel API response. Confirmed live 2026-09-06. */
function looksLikeTunnelDownPage(status: number, contentType: string | null, bodyText: string): boolean {
  if (status < 520 || status > 530) return false;
  if (contentType && contentType.includes("application/json")) return false;
  return bodyText.includes("Cloudflare Tunnel error") || bodyText.includes("cloudflare") || bodyText.includes("<!doctype html");
}

export interface LocalAIProbeResult {
  tunnelReachable: boolean;
  apiReachable: boolean;
  modelAvailable: boolean;
  modelStatus: Record<string, unknown>;
  status: LocalAIConnectionStatus;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Real network probe against the paired machine -- no mocks, no cached
 * assumption. Distinguishes three independent failure classes: the
 * network/tunnel itself unreachable, the tunnel up but returning
 * Cloudflare's own edge error (the physical machine or its tunnel process
 * is down), and the tunnel+API both up but the stored key rejected or no
 * model loaded.
 */
export async function probeLocalAIConnection(args: { apiUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: FetchLike }): Promise<LocalAIProbeResult> {
  const timeoutMs = args.timeoutMs ?? 8_000;
  const fetchImpl = args.fetchImpl ?? fetch;
  const baseUrl = args.apiUrl.replace(/\/+$/, "");
  const authHeaders = { Authorization: `Bearer ${args.apiKey}` };

  let tunnelReachable = false;
  let apiReachable = false;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  async function probeOnce(path: string): Promise<"ok" | "tunnel_down" | "api_error" | "network_failure"> {
    let response: Response;
    try {
      response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, { method: "GET", headers: authHeaders }, timeoutMs);
    } catch (err) {
      errorCode = "NETWORK_UNREACHABLE";
      errorMessage = err instanceof Error ? err.message : "Network request failed";
      return "network_failure";
    }
    const contentType = response.headers.get("content-type");
    if (response.ok) {
      tunnelReachable = true;
      apiReachable = true;
      return "ok";
    }
    const bodyText = await response.text().catch(() => "");
    if (looksLikeTunnelDownPage(response.status, contentType, bodyText)) {
      errorCode = "TUNNEL_DOWN";
      errorMessage = "The Cloudflare tunnel reports the Local AI machine is unreachable (tunnel or machine offline).";
      return "tunnel_down";
    }
    // A real response came back from something other than Cloudflare's edge --
    // the tunnel itself is up, the application behind it returned an error.
    tunnelReachable = true;
    if (response.status === 401 || response.status === 403) {
      errorCode = "AUTH_REJECTED";
      errorMessage = "The Local AI server rejected the stored connection key. Re-pairing is required.";
    } else {
      errorCode = `LOCAL_AI_HTTP_${response.status}`;
      errorMessage = bodyText.slice(0, 300) || `Local AI server returned HTTP ${response.status}`;
    }
    return "api_error";
  }

  if ((await probeOnce("/v1/ready")) !== "ok") await probeOnce("/v1/health");

  let modelAvailable = false;
  let modelStatus: Record<string, unknown> = {};
  if (apiReachable) {
    try {
      const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/models`, { method: "GET", headers: authHeaders }, timeoutMs);
      if (response.ok) {
        // Real, empirically-confirmed shape (2026-09-06, live against
        // ai.stratxcel.in): { models: [{ name, tier, purpose,
        // vram_usage_mb, status: "available"|"unconfigured" }] } -- NOT
        // { data: [{id}] } or { models: [{id}] } as first assumed. Every
        // field name here checks both the real shape and the more
        // generic id/data shape other AI provider APIs use, so this
        // survives either without needing another round of empirical
        // discovery if the server's shape shifts again.
        const json = (await response.json()) as {
          data?: Array<{ id?: string; name?: string; status?: string }>;
          models?: Array<{ id?: string; name?: string; status?: string }>;
        };
        const models = json.data ?? json.models ?? [];
        const names = models.map((m) => m.name ?? m.id).filter((v): v is string => Boolean(v));
        const withStatus = models.filter((m) => typeof m.status === "string");
        modelAvailable = withStatus.length > 0 ? withStatus.some((m) => m.status === "available") : models.length > 0;
        modelStatus = { models: names };
        if (!modelAvailable) errorCode = errorCode ?? "NO_MODEL_LOADED";
      } else {
        modelStatus = { error: `HTTP ${response.status}` };
        errorCode = errorCode ?? `LOCAL_AI_MODELS_HTTP_${response.status}`;
      }
    } catch (err) {
      modelStatus = { error: err instanceof Error ? err.message : "models_request_failed" };
      errorCode = errorCode ?? "LOCAL_AI_MODELS_NETWORK_FAILURE";
    }
  }

  const status: LocalAIConnectionStatus = !tunnelReachable || !apiReachable ? "DISCONNECTED" : modelAvailable ? "CONNECTED" : "ERROR";
  if (status === "CONNECTED") {
    errorCode = null;
    errorMessage = null;
  }

  return { tunnelReachable, apiReachable, modelAvailable, modelStatus, status, errorCode, errorMessage };
}

/** Best-effort extraction -- the real /v1/pair success shape has not been empirically confirmed (see module header). Never throws on an unexpected shape; the caller decides what to do with a null field. */
function extractPairedCredentials(body: unknown): { apiKey: string | null; machineName: string | null; machineId: string | null } {
  const obj = (body ?? {}) as Record<string, unknown>;
  const apiKey = [obj.machine_api_key, obj.api_key, obj.key].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  const machineName = [obj.machine_name, obj.name, obj.hostname].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  const machineId = [obj.machine_id, obj.id, obj.device_id].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  return { apiKey, machineName, machineId };
}

export type PairLocalAIResult =
  | { ok: true; connection: LocalAIConnectionSummary }
  | { ok: false; errorCode: string; errorMessage: string };

/**
 * Real POST /v1/pair exchange (no Authorization header -- see module
 * header). On success, deactivates any prior connection and inserts a new
 * row so pairing history stays auditable, then immediately runs a real
 * probe so the admin sees genuine live status, not an optimistic guess.
 */
export async function pairLocalAIConnection(
  service: ServiceClient,
  args: { apiUrl: string; pairingCode: string; pairedByUserId: string | null; fetchImpl?: FetchLike }
): Promise<PairLocalAIResult> {
  const baseUrl = args.apiUrl.replace(/\/+$/, "");
  const fetchImpl = args.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/pair`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairing_code: args.pairingCode }) },
      15_000
    );
  } catch (err) {
    return { ok: false, errorCode: "NETWORK_UNREACHABLE", errorMessage: err instanceof Error ? err.message : "Could not reach the Local AI server." };
  }

  const text = await response.text().catch(() => "");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    const detail = (body as { detail?: unknown })?.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? "Pairing code is missing or malformed." : `Pairing failed (HTTP ${response.status}).`;
    return { ok: false, errorCode: response.status === 400 ? "INVALID_OR_EXPIRED_CODE" : `LOCAL_AI_PAIR_HTTP_${response.status}`, errorMessage: message };
  }

  const { apiKey, machineName, machineId } = extractPairedCredentials(body);
  if (!apiKey) {
    return {
      ok: false,
      errorCode: "UNEXPECTED_PAIR_RESPONSE_SHAPE",
      errorMessage: "The Local AI server accepted the code but returned no recognizable API key field. The raw response was not saved because pairing did not complete.",
    };
  }

  const vault = createDevEncryptedVault(service);
  const tokenRef = await vault.store(apiKey);

  const nowIso = new Date().toISOString();
  const { error: deactivateError } = await service.from("local_ai_connections").update({ is_active: false, updated_at: nowIso }).eq("is_active", true);
  if (deactivateError) throw new Error(`pairLocalAIConnection: failed to deactivate prior connection: ${deactivateError.message}`);

  const { data: inserted, error: insertError } = await service
    .from("local_ai_connections")
    .insert({
      machine_name: machineName,
      machine_id: machineId,
      api_url: baseUrl,
      encrypted_token_ref: tokenRef,
      status: "RECONNECTING",
      last_paired_at: nowIso,
      raw_pair_response: body,
      paired_by_user_id: args.pairedByUserId,
      is_active: true,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(`pairLocalAIConnection: failed to save connection: ${insertError.message}`);

  const probe = await probeLocalAIConnection({ apiUrl: baseUrl, apiKey, fetchImpl });
  const updated = await applyProbeResult(service, inserted as LocalAIConnectionRow, probe);
  return { ok: true, connection: toSummary(updated) };
}

async function applyProbeResult(service: ServiceClient, row: LocalAIConnectionRow, probe: LocalAIProbeResult): Promise<LocalAIConnectionRow> {
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("local_ai_connections")
    .update({
      status: probe.status,
      tunnel_reachable: probe.tunnelReachable,
      api_reachable: probe.apiReachable,
      model_available: probe.modelAvailable,
      model_status: probe.modelStatus,
      last_checked_at: nowIso,
      last_seen_at: probe.status === "CONNECTED" ? nowIso : row.last_seen_at,
      last_error: probe.errorMessage,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw new Error(`applyProbeResult failed: ${error.message}`);
  return data as LocalAIConnectionRow;
}

async function getActiveConnectionRow(service: ServiceClient): Promise<LocalAIConnectionRow | null> {
  const { data, error } = await service.from("local_ai_connections").select("*").eq("is_active", true).maybeSingle();
  if (error) throw new Error(`getActiveConnectionRow failed: ${error.message}`);
  return (data as LocalAIConnectionRow | null) ?? null;
}

/** Cheap read -- no network call. Used for the initial page load / cheap polling ticks. */
export async function getLocalAIConnectionStatus(service: ServiceClient): Promise<LocalAIConnectionSummary | null> {
  const row = await getActiveConnectionRow(service);
  return row ? toSummary(row) : null;
}

/**
 * Real re-verification: decrypts the stored key, probes the machine live,
 * and persists the result. This is the one function that makes "automatic
 * reconnect/health-check without re-entering a code" real -- called by the
 * scheduled health-check route and by the admin page's own polling.
 */
export async function refreshLocalAIConnectionStatus(service: ServiceClient): Promise<LocalAIConnectionSummary | null> {
  const row = await getActiveConnectionRow(service);
  if (!row) return null;

  const vault = createDevEncryptedVault(service);
  const apiKey = await vault.retrieve(row.encrypted_token_ref);
  if (!apiKey) {
    const updated = await applyProbeResult(service, row, {
      tunnelReachable: false,
      apiReachable: false,
      modelAvailable: false,
      modelStatus: {},
      status: "ERROR",
      errorCode: "TOKEN_MISSING",
      errorMessage: "The stored connection key could not be retrieved from the vault. Re-pairing is required.",
    });
    return toSummary(updated);
  }

  const probe = await probeLocalAIConnection({ apiUrl: row.api_url, apiKey });
  const updated = await applyProbeResult(service, row, probe);
  return toSummary(updated);
}

export type ManualConnectionResult = { ok: true; connection: LocalAIConnectionSummary } | { ok: false; errorMessage: string };

/** Deliberate, manual disconnect -- keeps the paired key (no re-pairing needed to reconnect), just marks the connection inactive/disconnected. */
export async function disconnectLocalAIConnection(service: ServiceClient, connectionId: string): Promise<ManualConnectionResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("local_ai_connections")
    .update({ status: "DISCONNECTED", tunnel_reachable: false, api_reachable: false, model_available: false, updated_at: nowIso })
    .eq("id", connectionId)
    .select("*")
    .single();
  if (error) return { ok: false, errorMessage: error.message };
  return { ok: true, connection: toSummary(data as LocalAIConnectionRow) };
}

/** Re-runs a real probe against the SAME stored key -- no new pairing code required. */
export async function reconnectLocalAIConnection(service: ServiceClient, connectionId: string): Promise<ManualConnectionResult> {
  const { data: row, error } = await service.from("local_ai_connections").select("*").eq("id", connectionId).maybeSingle();
  if (error) return { ok: false, errorMessage: error.message };
  if (!row) return { ok: false, errorMessage: "Connection not found." };

  await service.from("local_ai_connections").update({ status: "RECONNECTING", updated_at: new Date().toISOString() }).eq("id", connectionId);

  const vault = createDevEncryptedVault(service);
  const apiKey = await vault.retrieve((row as LocalAIConnectionRow).encrypted_token_ref);
  if (!apiKey) {
    const updated = await applyProbeResult(service, row as LocalAIConnectionRow, {
      tunnelReachable: false,
      apiReachable: false,
      modelAvailable: false,
      modelStatus: {},
      status: "ERROR",
      errorCode: "TOKEN_MISSING",
      errorMessage: "The stored connection key could not be retrieved from the vault. Re-pairing is required.",
    });
    return { ok: true, connection: toSummary(updated) };
  }

  const probe = await probeLocalAIConnection({ apiUrl: (row as LocalAIConnectionRow).api_url, apiKey });
  const updated = await applyProbeResult(service, row as LocalAIConnectionRow, probe);
  return { ok: true, connection: toSummary(updated) };
}
