/**
 * Canonical server-side email configuration.
 * Presence of a string in env never implies OPERATIONAL health.
 */

import { resolveCanonicalAppOrigin } from "./app-origin.ts";

export interface EmailRuntimeConfig {
  provider: string;
  from: string;
  replyTo: string;
  supportEmail: string;
  billingEmail: string;
  securityEmail: string;
  grievanceEmail: string;
  appBaseUrl: string;
  testMode: boolean;
  liveSmokeEnabled: boolean;
  liveSmokeTo: string | null;
  resendApiKeyConfigured: boolean;
  providerTimeoutMs: number;
  probeTimeoutMs: number;
  /**
   * How the outbox processor is hosted.
   * - mission-worker: long-running poll inside apps/mission-worker
   * - http-manual: authenticated endpoint only (no always-on scheduler)
   * - unset / other: PROCESSOR_NOT_CONFIGURED for System Health
   */
  processorMode: string;
}

function trimOrEmpty(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTimeoutMs(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function loadEmailRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EmailRuntimeConfig {
  const supportEmail = trimOrEmpty(env.SUPPORT_EMAIL) || "support@stratxcel.ai";
  return {
    provider: (trimOrEmpty(env.EMAIL_PROVIDER) || "resend").toLowerCase(),
    from: trimOrEmpty(env.EMAIL_FROM) || `Stratxcel <${supportEmail}>`,
    replyTo: trimOrEmpty(env.EMAIL_REPLY_TO) || supportEmail,
    supportEmail,
    billingEmail: trimOrEmpty(env.BILLING_EMAIL) || supportEmail,
    securityEmail: trimOrEmpty(env.SECURITY_EMAIL) || supportEmail,
    grievanceEmail: trimOrEmpty(env.GRIEVANCE_EMAIL) || supportEmail,
    appBaseUrl: resolveCanonicalAppOrigin(env),
    testMode: env.NODE_ENV === "test" || env.EMAIL_TEST_MODE === "1",
    liveSmokeEnabled: env.EMAIL_LIVE_SMOKE_TEST === "1",
    liveSmokeTo: trimOrEmpty(env.EMAIL_LIVE_SMOKE_TO) || null,
    resendApiKeyConfigured: Boolean(trimOrEmpty(env.RESEND_API_KEY)),
    providerTimeoutMs: parseTimeoutMs(env.EMAIL_PROVIDER_TIMEOUT_MS, 15_000, 1_000, 60_000),
    probeTimeoutMs: parseTimeoutMs(env.EMAIL_PROBE_TIMEOUT_MS, 5_000, 500, 30_000),
    // Default to mission-worker when the process is the mission worker (set there).
    // Unset in Vercel web = processor not claimed operational via cron.
    processorMode: (trimOrEmpty(env.EMAIL_PROCESSOR_MODE) || "").toLowerCase(),
  };
}

export function extractEmailAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return fromHeader.trim().toLowerCase();
}

/** True when a real always-on or explicitly configured processor path exists. */
export function isEmailProcessorPathConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = loadEmailRuntimeConfig(env).processorMode;
  return mode === "mission-worker" || mode === "http-manual-with-external-scheduler";
}
