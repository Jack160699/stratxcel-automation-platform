/**
 * Server-side-only Hermes runtime configuration. HERMES_API_KEY must never
 * reach a browser bundle, a log line, a React prop, or an API response —
 * this module is the single place that reads it, and every consumer takes
 * the resolved config object, never `process.env.HERMES_API_KEY` directly,
 * so a grep for `HERMES_API_KEY` outside this file is a real finding.
 *
 * `HERMES_MODE` (not the suggested `HERMES_RUNTIME_ENABLED`) is kept as the
 * primary switch — see docs/hermes/RECONCILIATION.md's "Env var decision"
 * for why: it's the existing, tested convention in this codebase
 * (packages/hermes/src/select-adapter.ts), and a second boolean that must
 * stay in sync with it would only add a way for the two to disagree.
 */

export type HermesMode = "disabled" | "mock" | "http";

export interface HermesRuntimeConfig {
  mode: HermesMode;
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
  sseIdleTimeoutMs: number;
  transcriptBackfillEnabled: boolean;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_SSE_IDLE_TIMEOUT_MS = 60_000;

export class HermesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesConfigError";
  }
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HermesConfigError(`${name} must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function readMode(): HermesMode {
  const raw = process.env.HERMES_MODE;
  if (raw === "mock" || raw === "http") return raw;
  // Fail-safe default: unset or unrecognized always means "nothing runs,"
  // never an unintended live call (same rule as @stratxcel/whatsapp and
  // @stratxcel/payments-and-wallet's integration-mode flags).
  return "disabled";
}

/**
 * Reads and validates Hermes runtime config from the environment. Throws
 * `HermesConfigError` when `HERMES_MODE=http` but required config is
 * missing or malformed — this is the "fail closed when Hermes is disabled
 * or configuration is missing" requirement: an `http`-mode adapter must
 * never silently degrade into acting like `disabled`, it must be loud about
 * misconfiguration at startup, not at the first mission's expense.
 */
export function loadHermesRuntimeConfig(): HermesRuntimeConfig {
  const mode = readMode();

  const requestTimeoutMs = parsePositiveInt(
    "HERMES_REQUEST_TIMEOUT_MS",
    process.env.HERMES_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
  );
  const sseIdleTimeoutMs = parsePositiveInt(
    "HERMES_SSE_IDLE_TIMEOUT_MS",
    process.env.HERMES_SSE_IDLE_TIMEOUT_MS,
    DEFAULT_SSE_IDLE_TIMEOUT_MS
  );
  const transcriptBackfillEnabled = process.env.HERMES_TRANSCRIPT_BACKFILL_ENABLED === "true";

  if (mode !== "http") {
    return {
      mode,
      baseUrl: "",
      apiKey: "",
      requestTimeoutMs,
      sseIdleTimeoutMs,
      transcriptBackfillEnabled,
    };
  }

  const baseUrl = process.env.HERMES_BASE_URL;
  const apiKey = process.env.HERMES_API_KEY;

  if (!baseUrl) {
    throw new HermesConfigError("HERMES_MODE is 'http' but HERMES_BASE_URL is not set");
  }
  if (!apiKey) {
    throw new HermesConfigError("HERMES_MODE is 'http' but HERMES_API_KEY is not set");
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new HermesConfigError(`HERMES_BASE_URL must be http(s), got ${parsed.protocol}`);
    }
  } catch (err) {
    if (err instanceof HermesConfigError) throw err;
    throw new HermesConfigError(`HERMES_BASE_URL is not a valid URL: ${baseUrl}`);
  }

  return {
    mode,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    requestTimeoutMs,
    sseIdleTimeoutMs,
    transcriptBackfillEnabled,
  };
}
