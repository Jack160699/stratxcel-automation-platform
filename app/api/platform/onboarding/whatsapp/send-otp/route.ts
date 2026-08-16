import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

function getSecret(): string {
  return (
    process.env.WHATSAPP_OTP_SECRET ||
    process.env.SOCIAL_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "stratxcel-default-whatsapp-otp-secret-salt-2026"
  );
}

function hashOtp(phone: string, otp: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${phone}:${otp}`)
    .digest("hex");
}

function normalizePhone(input: string): string {
  // Remove non-digit characters except leading +
  let cleaned = input.trim().replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    // Default to India (+91) if 10 digits
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  return `${prefix} ••••• •${suffix}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const rawPhone = (body.phone ?? "").trim();

  if (!rawPhone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  // Basic E.164 sanity check (+ followed by 10 to 15 digits)
  if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
    return NextResponse.json(
      { error: "Invalid phone number format. Please include your country code (e.g. +91 98765 43210)." },
      { status: 400 }
    );
  }

  const service = createSupabaseServiceClient();
  const { data: userData } = await service.auth.admin.getUserById(user.id);
  const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const currentOtpState = existingMeta.onboarding_whatsapp_otp_state as
    | { phone: string; lastSentAt: number; expiresAt: number }
    | undefined;

  // Enforce 60-second cooldown
  if (currentOtpState && currentOtpState.phone === phone) {
    const elapsed = Date.now() - currentOtpState.lastSentAt;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSeconds}s before requesting a new OTP.` },
        { status: 429 }
      );
    }
  }

  // Generate cryptographically secure 6-digit OTP
  const otpNumber = crypto.randomInt(100000, 999999).toString();
  const hashed = hashOtp(phone, otpNumber);
  const expiresAt = Date.now() + OTP_TTL_MS;
  const now = Date.now();

  const newOtpState = {
    phone,
    hash: hashed,
    attemptsLeft: MAX_ATTEMPTS,
    expiresAt,
    lastSentAt: now,
  };

  await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...existingMeta,
      onboarding_whatsapp_otp_state: newOtpState,
    },
  });

  // Send WhatsApp message through available WhatsApp runtime
  try {
    const whatsappApiUrl = process.env.WHATSAPP_API_URL;
    const whatsappToken = process.env.WHATSAPP_API_TOKEN;

    if (whatsappApiUrl && whatsappToken) {
      await fetch(whatsappApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phone,
          type: "template",
          template: {
            name: "stratxcel_otp_verification",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: otpNumber }],
              },
            ],
          },
        }),
      });
    } else {
      // In development / staging / demo without live WhatsApp template, log safe trace
      console.log(`[WhatsApp OTP Dispatched] To: ${maskPhone(phone)} (expires in 5m)`);
    }
  } catch (sendErr) {
    console.warn("WhatsApp OTP dispatch network trace:", sendErr);
  }

  return NextResponse.json({
    ok: true,
    maskedPhone: maskPhone(phone),
    cooldownSeconds: 60,
    expiresInSeconds: 300,
  });
}
