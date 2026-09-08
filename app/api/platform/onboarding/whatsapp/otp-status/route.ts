import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getWhatsAppOtpDeliveryStatus } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only delivery-status check the client polls while an OTP entry
 * screen is open -- lets the UI show a truthful "Delivered to your phone"
 * hint instead of only ever assuming a successful send means a successful
 * delivery (STRATXCEL PRODUCTION REPAIR mission, Section 3). Never blocks
 * or gates OTP verification itself -- entering the correct code always
 * works regardless of what this endpoint reports, matching Section 8's
 * "connection must be non-blocking" requirement.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone query parameter is required." }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const result = await getWhatsAppOtpDeliveryStatus(service, {
    phone,
    purpose: "onboarding_verification",
    userId: user.id,
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
