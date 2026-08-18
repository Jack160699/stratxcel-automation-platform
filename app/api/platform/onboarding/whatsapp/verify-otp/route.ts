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

  // 4. If user already has an active workspace/tenant, provision canonical whatsapp_phone_bindings directly
  try {
    const requestedTenantId = typeof (body as any).tenantId === "string" ? (body as any).tenantId : null;
    let targetTenantId: string | null = requestedTenantId;
    if (!targetTenantId) {
      const { data: mems } = await service
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", user.id);
      // Only auto-resolve when unambiguous -- same reasoning as the OAuth
      // callback's tenant fallback (app/api/social/oauth/[provider]/callback/
      // route.ts): a user with more than one tenant must never have a
      // connector silently attached to an arbitrarily-picked one.
      if (mems && mems.length === 1) {
        targetTenantId = mems[0].tenant_id;
      }
    }

    if (targetTenantId) {
      const { data: existingBinding } = await service
        .from("whatsapp_phone_bindings")
        .select("id")
        .eq("tenant_id", targetTenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const now = new Date().toISOString();
      if (existingBinding) {
        await service
          .from("whatsapp_phone_bindings")
          .update({
            display_phone_number: normalizedPhone,
            phone_number_id: normalizedPhone,
            status: "active",
            verified_at: now,
            updated_at: now,
          })
          .eq("id", existingBinding.id);
      } else {
        await service.from("whatsapp_phone_bindings").insert({
          tenant_id: targetTenantId,
          waba_id: "waba_onboarding",
          phone_number_id: normalizedPhone,
          display_phone_number: normalizedPhone,
          environment: "production",
          status: "active",
          default_language: "en",
          timezone: "UTC",
          created_by: user.id,
          verified_at: now,
          updated_at: now,
        });
      }
    }
  } catch (bindingErr) {
    console.warn("verify-otp: non-fatal direct tenant binding trace", bindingErr);
  }

  return NextResponse.json({
    ok: true,
    verifiedNumber: normalizedPhone,
    connection: verifiedPayload,
  });
}
