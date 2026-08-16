import crypto from "node:crypto";
import type { ServiceClient } from "./db.ts";

export const META_AUTHENTICATION_TEMPLATE_NAME = "stratxcel_login_otp";
export const META_AUTHENTICATION_TEMPLATE_LANG = "en_US";
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (matching template preview)
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const MAX_VERIFICATION_ATTEMPTS = 5;
export const MAX_SEND_PER_PHONE_WINDOW = 5; // max 5 per 15m
export const MAX_SEND_PER_IP_WINDOW = 10; // max 10 per 15m
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface SendOtpOptions {
  phone: string;
  purpose?: string;
  userId?: string | null;
  tenantId?: string | null;
  ipAddress?: string | null;
  secret?: string;
  customTtlMs?: number;
  mockSender?: (payload: { to: string; otp: string }) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
}

export interface SendOtpResult {
  ok: boolean;
  maskedPhone: string;
  normalizedPhone: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
  providerMessageId?: string | null;
  error?: string;
  errorCode?: string;
  status?: number;
}

export interface VerifyOtpOptions {
  phone: string;
  otp: string;
  purpose?: string;
  secret?: string;
}

export interface VerifyOtpResult {
  ok: boolean;
  phone?: string;
  verificationId?: string;
  error?: string;
  errorCode?: "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INVALID_OTP" | "ALREADY_CONSUMED";
  attemptsLeft?: number;
  status?: number;
}

/**
 * Returns the server-only secret used for HMAC-SHA256 OTP hashing.
 * Never exposed to the client or browser.
 */
export function getOtpSecret(): string {
  return (
    process.env.WHATSAPP_OTP_SECRET?.trim() ||
    process.env.SOCIAL_OAUTH_STATE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "stratxcel-default-whatsapp-otp-hmac-salt-2026"
  );
}

/**
 * Validates and normalizes phone number to canonical E.164 (e.g. "+919876543210").
 * Defaults bare 10-digit numbers to India (+91).
 */
export function normalizePhoneNumberE164(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  let cleaned = input.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
      cleaned = `+91${cleaned.slice(1)}`;
    } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
      cleaned = `+${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  // E.164 validation: + followed by 10 to 15 digits
  if (!/^\+[1-9]\d{9,14}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Extracts pure digits from an E.164 number for Meta WhatsApp Cloud API (e.g. "919876543210").
 */
export function getMetaPhoneDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/**
 * Masks phone number for safe client UI and log display (e.g. "+91 98••• ••210").
 */
export function maskPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumberE164(phone) || phone;
  if (normalized.length <= 6) return normalized;
  const prefix = normalized.slice(0, 5);
  const suffix = normalized.slice(-3);
  return `${prefix} •••• •${suffix}`;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP string.
 */
export function generateSecureOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes an HMAC-SHA256 hash of the phone and OTP using the server-only secret.
 */
export function hashOtp(phone: string, otp: string, secret?: string): string {
  const key = secret || getOtpSecret();
  return crypto
    .createHmac("sha256", key)
    .update(`${phone}:${otp}`)
    .digest("hex");
}

/**
 * Performs timing-safe comparison between candidate OTP and expected HMAC hash.
 */
export function verifyOtpHash(phone: string, candidateOtp: string, expectedHash: string, secret?: string): boolean {
  if (!candidateOtp || candidateOtp.length !== 6 || !/^\d{6}$/.test(candidateOtp)) {
    return false;
  }
  const candidateHash = hashOtp(phone, candidateOtp, secret);
  const expectedBuf = Buffer.from(expectedHash, "hex");
  const candidateBuf = Buffer.from(candidateHash, "hex");

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

/**
 * Resolves Meta WhatsApp Cloud API credentials from environment.
 */
export function getMetaWhatsAppCredentials() {
  const token =
    process.env.WHATSAPP_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    process.env.WHATSAPP_API_TOKEN?.trim() ||
    null;

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    null;

  const apiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ||
    "v20.0";

  return { token, phoneNumberId, apiVersion };
}

/**
 * Sends the Meta WhatsApp Authentication Template (stratxcel_login_otp)
 * with the Copy Code delivery method.
 */
export async function sendMetaAuthenticationOtp({
  toPhoneDigits,
  otpCode,
  mockSender,
}: {
  toPhoneDigits: string;
  otpCode: string;
  mockSender?: (payload: any) => Promise<{ ok: boolean; messageId?: string; error?: string }>;
}): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
  code?: number;
  subcode?: number;
  httpStatus?: number;
  fbtraceId?: string;
}> {
  const correlationId = `wa_otp_${crypto.randomUUID().slice(0, 8)}`;
  const maskedTo = toPhoneDigits.length > 6 ? `${toPhoneDigits.slice(0, 4)}••••${toPhoneDigits.slice(-2)}` : toPhoneDigits;

  if (mockSender) {
    const mockRes = await mockSender({ to: toPhoneDigits, otp: otpCode });
    if (mockRes.ok && mockRes.messageId) {
      return { ok: true, messageId: mockRes.messageId };
    }
    return { ok: false, error: mockRes.error || "Mock delivery failed" };
  }

  const { token, phoneNumberId, apiVersion } = getMetaWhatsAppCredentials();

  if (!token || !phoneNumberId) {
    const missing = [
      !token ? "WHATSAPP_TOKEN / META_ACCESS_TOKEN" : null,
      !phoneNumberId ? "WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_PHONE_NUMBER_ID" : null,
    ].filter(Boolean);

    console.error(`[Meta WhatsApp OTP] [${correlationId}] Dispatch aborted — Missing credentials: ${missing.join(", ")}`);
    return {
      ok: false,
      error: `WhatsApp Cloud API credentials not configured (${missing.join(", ")}).`,
    };
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  // Canonical Meta Authentication Copy Code Template payload
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhoneDigits,
    type: "template",
    template: {
      name: META_AUTHENTICATION_TEMPLATE_NAME,
      language: { code: META_AUTHENTICATION_TEMPLATE_LANG },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: otpCode,
            },
          ],
        },
        {
          type: "button",
          sub_type: "copy_code",
          index: 0,
          parameters: [
            {
              type: "coupon_code",
              coupon_code: otpCode,
            },
          ],
        },
      ],
    },
  };

  // Safe sanitized outgoing payload trace (NO tokens, NO plaintext OTP in logs)
  console.log(`[Meta WhatsApp OTP Request] [${correlationId}] POST ${endpoint} -> To: ${maskedTo}, Template: ${META_AUTHENTICATION_TEMPLATE_NAME} (${META_AUTHENTICATION_TEMPLATE_LANG}), Button: copy_code (index 0)`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string; type?: string };
    };

    // Safe sanitized response trace
    console.log(`[Meta WhatsApp OTP Response] [${correlationId}] HTTP ${res.status}`, {
      status: res.status,
      messageId: data.messages?.[0]?.id || null,
      errorCode: data.error?.code || null,
      errorSubcode: data.error?.error_subcode || null,
      errorMessage: data.error?.message ? data.error.message.replace(/[A-Za-z0-9_-]{25,}/g, "[redacted]") : null,
      fbtraceId: data.error?.fbtrace_id || null,
    });

    if (res.ok && data.messages?.[0]?.id) {
      return { ok: true, messageId: data.messages[0].id, httpStatus: res.status };
    }

    const errorMsg = data.error?.message || `Meta WhatsApp API error (HTTP ${res.status})`;
    return {
      ok: false,
      error: errorMsg,
      code: data.error?.code,
      subcode: data.error?.error_subcode,
      httpStatus: res.status,
      fbtraceId: data.error?.fbtrace_id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error contacting Meta WhatsApp Cloud API";
    console.error(`[Meta WhatsApp OTP Error] [${correlationId}]`, message);
    return { ok: false, error: message };
  }
}

/**
 * High-level service: Generates, rate-limits, persists, and dispatches a WhatsApp OTP.
 */
export async function sendWhatsAppOtp(
  supabase: ServiceClient,
  options: SendOtpOptions
): Promise<SendOtpResult> {
  const normalizedPhone = normalizePhoneNumberE164(options.phone);
  if (!normalizedPhone) {
    return {
      ok: false,
      maskedPhone: options.phone,
      normalizedPhone: options.phone,
      cooldownSeconds: 0,
      expiresInSeconds: 0,
      error: "Invalid phone number. Please include your country code (e.g. +91 98765 43210).",
      errorCode: "INVALID_PHONE",
      status: 400,
    };
  }

  const masked = maskPhoneNumber(normalizedPhone);
  const purpose = options.purpose || "onboarding_verification";
  const now = new Date();
  const ttlMs = options.customTtlMs || OTP_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);

  // 1. Check Resend Cooldown and Rate Limits
  try {
    const { data: recentRows } = await supabase
      .from("whatsapp_otp_verifications")
      .select("id, created_at, consumed_at, expires_at")
      .eq("destination_phone", normalizedPhone)
      .eq("purpose", purpose)
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentRows && recentRows.length > 0) {
      const latest = recentRows[0];
      const elapsedMs = now.getTime() - new Date(latest.created_at).getTime();

      // Enforce 60s cooldown
      if (elapsedMs < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
        return {
          ok: false,
          maskedPhone: masked,
          normalizedPhone,
          cooldownSeconds: waitSec,
          expiresInSeconds: Math.max(0, Math.floor((new Date(latest.expires_at).getTime() - now.getTime()) / 1000)),
          error: `Please wait ${waitSec}s before requesting a new code.`,
          errorCode: "COOLDOWN_ACTIVE",
          status: 429,
        };
      }

      // Check max sends per 15 minutes
      const windowCutoff = now.getTime() - RATE_LIMIT_WINDOW_MS;
      const countInWindow = recentRows.filter(
        (r) => new Date(r.created_at).getTime() >= windowCutoff
      ).length;

      if (countInWindow >= MAX_SEND_PER_PHONE_WINDOW) {
        return {
          ok: false,
          maskedPhone: masked,
          normalizedPhone,
          cooldownSeconds: 60,
          expiresInSeconds: 0,
          error: "Too many OTP requests for this phone number. Please try again later.",
          errorCode: "RATE_LIMIT_EXCEEDED",
          status: 429,
        };
      }
    }

    // IP-based rate limit
    if (options.ipAddress) {
      const windowIso = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count: ipCount } = await supabase
        .from("whatsapp_otp_verifications")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", options.ipAddress)
        .gte("created_at", windowIso);

      if (ipCount && ipCount >= MAX_SEND_PER_IP_WINDOW) {
        return {
          ok: false,
          maskedPhone: masked,
          normalizedPhone,
          cooldownSeconds: 60,
          expiresInSeconds: 0,
          error: "Too many requests from your network. Please wait a few minutes.",
          errorCode: "IP_RATE_LIMIT_EXCEEDED",
          status: 429,
        };
      }
    }
  } catch {
    // Non-fatal if table doesn't exist yet or query fails, proceed to user metadata fallback
  }

  // 2. Generate secure 6-digit OTP
  const otpCode = generateSecureOtp();
  const hashed = hashOtp(normalizedPhone, otpCode, options.secret);
  const digitsOnly = getMetaPhoneDigits(normalizedPhone);

  // 3. Send WhatsApp Meta Template
  const sendResult = await sendMetaAuthenticationOtp({
    toPhoneDigits: digitsOnly,
    otpCode,
    mockSender: options.mockSender,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      maskedPhone: masked,
      normalizedPhone,
      cooldownSeconds: 0,
      expiresInSeconds: 0,
      error: sendResult.error || "Failed to deliver WhatsApp message. Please check the number.",
      errorCode: "PROVIDER_DELIVERY_FAILED",
      status: 502,
    };
  }

  // 4. Invalidate previous active OTPs and persist new record in DB
  try {
    // Mark previous unconsumed active rows as superseded
    await supabase
      .from("whatsapp_otp_verifications")
      .update({
        consumed_at: now.toISOString(),
        metadata: { superseded: true, superseded_at: now.toISOString() },
      })
      .eq("destination_phone", normalizedPhone)
      .eq("purpose", purpose)
      .is("consumed_at", null);

    // Insert new active OTP record
    await supabase.from("whatsapp_otp_verifications").insert({
      destination_phone: normalizedPhone,
      otp_hash: hashed,
      purpose,
      expires_at: expiresAt.toISOString(),
      max_attempts: MAX_VERIFICATION_ATTEMPTS,
      attempt_count: 0,
      ip_address: options.ipAddress || null,
      user_id: options.userId || null,
      tenant_id: options.tenantId || null,
      provider_message_id: sendResult.messageId || null,
      metadata: {
        template: META_AUTHENTICATION_TEMPLATE_NAME,
        lang: META_AUTHENTICATION_TEMPLATE_LANG,
      },
    });
  } catch {
    // Non-fatal fallback for environments without migration applied
  }

  // Also maintain user_metadata backup if userId is provided
  if (options.userId) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(options.userId);
      const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
      await supabase.auth.admin.updateUserById(options.userId, {
        user_metadata: {
          ...existingMeta,
          onboarding_whatsapp_otp_state: {
            phone: normalizedPhone,
            hash: hashed,
            attemptsLeft: MAX_VERIFICATION_ATTEMPTS,
            expiresAt: expiresAt.getTime(),
            lastSentAt: now.getTime(),
          },
        },
      });
    } catch {
      // Ignore metadata update error
    }
  }

  return {
    ok: true,
    maskedPhone: masked,
    normalizedPhone,
    cooldownSeconds: 60,
    expiresInSeconds: Math.floor(ttlMs / 1000),
    providerMessageId: sendResult.messageId,
  };
}

/**
 * High-level service: Verifies a candidate OTP against active hashed records.
 */
export async function verifyWhatsAppOtp(
  supabase: ServiceClient,
  options: VerifyOtpOptions
): Promise<VerifyOtpResult> {
  const normalizedPhone = normalizePhoneNumberE164(options.phone);
  if (!normalizedPhone) {
    return {
      ok: false,
      error: "Invalid phone number format.",
      errorCode: "NOT_FOUND",
      status: 400,
    };
  }

  const rawOtp = (options.otp || "").trim();
  if (!rawOtp || rawOtp.length !== 6 || !/^\d{6}$/.test(rawOtp)) {
    return {
      ok: false,
      error: "Please enter the complete 6-digit verification code.",
      errorCode: "INVALID_OTP",
      status: 400,
    };
  }

  const purpose = options.purpose || "onboarding_verification";
  const now = new Date();

  // 1. Locate active unconsumed OTP record from DB
  let activeRecord: {
    id: string;
    otp_hash: string;
    expires_at: string;
    attempt_count: number;
    max_attempts: number;
  } | null = null;

  try {
    const { data } = await supabase
      .from("whatsapp_otp_verifications")
      .select("id, otp_hash, expires_at, attempt_count, max_attempts")
      .eq("destination_phone", normalizedPhone)
      .eq("purpose", purpose)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    activeRecord = data;
  } catch {
    // Database query fallback
  }

  if (!activeRecord) {
    return {
      ok: false,
      error: "No active verification code found for this phone number. Please request a new code.",
      errorCode: "NOT_FOUND",
      status: 400,
    };
  }

  // 2. Check Expiration
  if (now.getTime() > new Date(activeRecord.expires_at).getTime()) {
    return {
      ok: false,
      error: "This verification code has expired. Please request a new code.",
      errorCode: "EXPIRED",
      status: 400,
    };
  }

  // 3. Check Attempt Limits
  if (activeRecord.attempt_count >= activeRecord.max_attempts) {
    return {
      ok: false,
      error: "Too many incorrect attempts. This code is locked. Please request a new code.",
      errorCode: "TOO_MANY_ATTEMPTS",
      attemptsLeft: 0,
      status: 429,
    };
  }

  // 4. Timing-safe Hash Verification
  const isMatch = verifyOtpHash(normalizedPhone, rawOtp, activeRecord.otp_hash, options.secret);

  if (!isMatch) {
    const nextAttempts = activeRecord.attempt_count + 1;
    const remaining = Math.max(0, activeRecord.max_attempts - nextAttempts);

    try {
      await supabase
        .from("whatsapp_otp_verifications")
        .update({
          attempt_count: nextAttempts,
          ...(remaining === 0 ? { consumed_at: now.toISOString(), metadata: { locked: true, reason: "max_attempts" } } : {}),
        })
        .eq("id", activeRecord.id);
    } catch {
      // Non-fatal
    }

    if (remaining === 0) {
      return {
        ok: false,
        error: "Incorrect code. Maximum attempts exceeded. Please request a new code.",
        errorCode: "TOO_MANY_ATTEMPTS",
        attemptsLeft: 0,
        status: 400,
      };
    }

    return {
      ok: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      errorCode: "INVALID_OTP",
      attemptsLeft: remaining,
      status: 400,
    };
  }

  // 5. Successful Verification — Consume immediately
  try {
    await supabase
      .from("whatsapp_otp_verifications")
      .update({
        consumed_at: now.toISOString(),
      })
      .eq("id", activeRecord.id);
  } catch {
    // Non-fatal
  }

  return {
    ok: true,
    phone: normalizedPhone,
    verificationId: activeRecord.id,
  };
}
