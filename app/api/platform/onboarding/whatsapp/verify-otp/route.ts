import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { verifyWhatsAppOtp, normalizePhoneNumberE164, verifyOtpHash } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const normalizedPhone = normalizePhoneNumberE164(rawPhone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  // 1. Try verification via the database-backed OTP service
  let result = await verifyWhatsAppOtp(service, {
    phone: normalizedPhone,
    otp: rawOtp,
    purpose: "onboarding_verification",
  });

  // 2. If not found in DB table (e.g. migration pending or user metadata fallback), check user_metadata
  if (!result.ok && result.errorCode === "NOT_FOUND") {
    const { data: userData } = await service.auth.admin.getUserById(user.id);
    const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const otpState = existingMeta.onboarding_whatsapp_otp_state as
      | { phone: string; hash: string; attemptsLeft: number; expiresAt: number }
      | undefined;

    if (otpState && otpState.phone === normalizedPhone) {
      if (Date.now() > otpState.expiresAt) {
        return NextResponse.json({ error: "This OTP has expired. Please request a new OTP." }, { status: 400 });
      }

      if (otpState.attemptsLeft <= 0) {
        return NextResponse.json({ error: "Too many incorrect attempts. Please request a new OTP." }, { status: 429 });
      }

      const isMatch = verifyOtpHash(normalizedPhone, rawOtp, otpState.hash);
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

      // Metadata match succeeded!
      result = { ok: true, phone: normalizedPhone };
    }
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "Invalid OTP code.",
        errorCode: result.errorCode,
        attemptsLeft: result.attemptsLeft,
      },
      { status: result.status || 400 }
    );
  }

  // 3. Mark user metadata with verified connection and invalidate active OTP
  const { data: userData } = await service.auth.admin.getUserById(user.id);
  const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const existingConnections = (existingMeta.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

  const verifiedPayload = {
    provider: "whatsapp",
    providerAccountId: normalizedPhone,
    username: normalizedPhone,
    displayName: normalizedPhone,
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
        phone: normalizedPhone,
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
    verifiedNumber: normalizedPhone,
    connection: verifiedPayload,
  });
}
