import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendWhatsAppOtp } from "@stratxcel/whatsapp";

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

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    purpose?: string;
    tenantId?: string;
  };

  const rawPhone = (body.phone ?? "").trim();
  if (!rawPhone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const realIp = req.headers.get("x-real-ip") ?? "";
  const ipAddress = forwarded.split(",")[0]?.trim() || realIp || null;

  const service = createSupabaseServiceClient();

  const result = await sendWhatsAppOtp(service, {
    phone: rawPhone,
    purpose: body.purpose || "phone_verification",
    userId: user.id,
    tenantId: body.tenantId || null,
    ipAddress,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "Failed to send WhatsApp verification code.",
        errorCode: result.errorCode,
        cooldownSeconds: result.cooldownSeconds,
      },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    maskedPhone: result.maskedPhone,
    normalizedPhone: result.normalizedPhone,
    cooldownSeconds: result.cooldownSeconds,
    expiresInSeconds: result.expiresInSeconds,
  });
}
