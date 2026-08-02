import crypto from "node:crypto";
import type { HermesRuntimeAdapter } from "./adapter.ts";
import { signPayload } from "./signing.ts";
import { HermesTimeoutError, HermesUnavailableError, type HermesExecutionResult, type HermesHealthStatus } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 120_000;

function getConfig() {
  const baseUrl = process.env.HERMES_GATEWAY_URL;
  const sharedSecret = process.env.HERMES_SHARED_SECRET;
  if (!baseUrl) throw new Error("HERMES_MODE is 'http' but HERMES_GATEWAY_URL is not set");
  if (!sharedSecret) throw new Error("HERMES_MODE is 'http' but HERMES_SHARED_SECRET is not set");
  return { baseUrl, sharedSecret };
}

async function signedFetch(url: string, body: unknown, sharedSecret: string, timeoutMs: number): Promise<Response> {
  const payload = JSON.stringify(body);
  const signature = signPayload(payload, sharedSecret);
  const correlationId = crypto.randomUUID();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Signature": signature,
        "X-Correlation-Id": correlationId,
      },
      body: payload,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new HermesTimeoutError();
    throw new HermesUnavailableError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Real HTTP client for a running Hermes instance — signs every request
 * (X-Hermes-Signature, same HMAC primitive as the mission tokens in
 * token.ts) so Hermes can verify calls actually came from this StratExcel
 * deployment, times out rather than hanging a mission-worker poll cycle
 * forever, and classifies timeouts/network failures as retryable
 * (isRetryableHermesFailure in types.ts) versus a real rejection response.
 * Inert until HERMES_MODE=http and both env vars are set — no Hermes
 * instance is running anywhere in this environment tonight (Docker is
 * unavailable here; see MANUAL_SETUP_REQUIRED.md), so this adapter is
 * validated by its tests and by typecheck, not by an actual round trip.
 */
export function createHermesHttpAdapter(): HermesRuntimeAdapter {
  return {
    mode: "http",
    async execute(mission, context, missionToken): Promise<HermesExecutionResult> {
      const { baseUrl, sharedSecret } = getConfig();
      const response = await signedFetch(
        `${baseUrl}/missions/execute`,
        { mission: { id: mission.id, hermesProfile: mission.hermes_profile }, context, missionToken },
        sharedSecret,
        DEFAULT_TIMEOUT_MS
      );
      if (!response.ok) throw new HermesUnavailableError(`Hermes returned HTTP ${response.status}`);
      return (await response.json()) as HermesExecutionResult;
    },
    async cancel(hermesRunId: string): Promise<void> {
      const { baseUrl, sharedSecret } = getConfig();
      await signedFetch(`${baseUrl}/missions/${hermesRunId}/cancel`, {}, sharedSecret, 10_000);
    },
    async healthCheck(): Promise<HermesHealthStatus> {
      try {
        const { baseUrl } = getConfig();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${baseUrl}/health`, { signal: controller.signal }).finally(() => clearTimeout(timeout));
        return { healthy: response.ok, mode: "http", details: `HTTP ${response.status}` };
      } catch (err) {
        return { healthy: false, mode: "http", details: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
