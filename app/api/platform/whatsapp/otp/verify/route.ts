import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { verifyWhatsAppOtp, normalizePhoneNumberE164 } from "@stratxcel/whatsapp";

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
    otp?: string;
    purpose?: string;
  };

  const rawPhone = (body.phone ?? "").trim();
  const rawOtp = (body.otp ?? "").trim();

  if (!rawPhone || !rawOtp) {
    return NextResponse.json({ error: "Phone number and 6-digit verification code are required." }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumberE164(rawPhone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  const result = await verifyWhatsAppOtp(service, {
    phone: normalizedPhone,
    otp: rawOtp,
    purpose: body.purpose || "phone_verification",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "Invalid verification code.",
        errorCode: result.errorCode,
        attemptsLeft: result.attemptsLeft,
      },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    phone: result.phone,
    verifiedAt: new Date().toISOString(),
  });
}
