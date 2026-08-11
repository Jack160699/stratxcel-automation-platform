/**
 * Canonical server-side email configuration.
 * Presence of a string in env never implies OPERATIONAL health.
 */

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
}

function trimOrEmpty(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
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
    appBaseUrl: trimOrEmpty(env.NEXT_PUBLIC_APP_URL) || trimOrEmpty(env.APP_BASE_URL) || "https://stratxcel.ai",
    testMode: env.NODE_ENV === "test" || env.EMAIL_TEST_MODE === "1",
    liveSmokeEnabled: env.EMAIL_LIVE_SMOKE_TEST === "1",
    liveSmokeTo: trimOrEmpty(env.EMAIL_LIVE_SMOKE_TO) || null,
    resendApiKeyConfigured: Boolean(trimOrEmpty(env.RESEND_API_KEY)),
  };
}

export function extractEmailAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return fromHeader.trim().toLowerCase();
}
