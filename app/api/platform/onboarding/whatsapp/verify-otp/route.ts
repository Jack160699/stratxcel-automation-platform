import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let cleaned = input.trim().replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string; otp?: string };
  const rawPhone = (body.phone ?? "").trim();
  const rawOtp = (body.otp ?? "").trim();

  if (!rawPhone || !rawOtp) {
    return NextResponse.json({ error: "Phone number and 6-digit OTP are required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  const service = createSupabaseServiceClient();
  const { data: userData } = await service.auth.admin.getUserById(user.id);
  const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const otpState = existingMeta.onboarding_whatsapp_otp_state as
    | { phone: string; hash: string; attemptsLeft: number; expiresAt: number }
    | undefined;

  if (!otpState || otpState.phone !== phone) {
    return NextResponse.json(
      { error: "No OTP was requested for this phone number. Please request a new OTP." },
      { status: 400 }
    );
  }

  if (Date.now() > otpState.expiresAt) {
    return NextResponse.json(
      { error: "This OTP has expired. Please request a new OTP." },
      { status: 400 }
    );
  }

  if (otpState.attemptsLeft <= 0) {
    return NextResponse.json(
      { error: "Too many incorrect attempts. Please request a new OTP." },
      { status: 429 }
    );
  }

  const candidateHash = hashOtp(phone, rawOtp);
  const expectedHashBuf = Buffer.from(otpState.hash);
  const candidateHashBuf = Buffer.from(candidateHash);

  const isMatch =
    expectedHashBuf.length === candidateHashBuf.length &&
    crypto.timingSafeEqual(expectedHashBuf, candidateHashBuf);

  if (!isMatch) {
    const nextAttempts = otpState.attemptsLeft - 1;
    await service.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...existingMeta,
        onboarding_whatsapp_otp_state: {
          ...otpState,
          attemptsLeft: nextAttempts,
        },
      },
    });

    if (nextAttempts <= 0) {
      return NextResponse.json(
        { error: "Incorrect OTP. Maximum attempts exceeded. Please request a new OTP." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Incorrect OTP. ${nextAttempts} attempt${nextAttempts === 1 ? "" : "s"} remaining.` },
      { status: 400 }
    );
  }

  // OTP verified successfully!
  // Invalidate OTP state immediately to prevent replay
  const existingConnections = (existingMeta.onboarding_oauth_connections ?? {}) as Record<string, unknown>;
  const verifiedPayload = {
    provider: "whatsapp",
    providerAccountId: phone,
    username: phone,
    displayName: phone,
    status: "connected",
    connectionType: "otp_verified",
    providerLabel: "WhatsApp Verified",
    connectedAt: new Date().toISOString(),
  };

  await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...existingMeta,
      onboarding_whatsapp_otp_state: null, // Invalidate OTP
      onboarding_whatsapp_verification: {
        phone,
        verifiedAt: new Date().toISOString(),
      },
      onboarding_oauth_connections: {
        ...existingConnections,
        whatsapp: verifiedPayload,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    verifiedNumber: phone,
    connection: verifiedPayload,
  });
}
