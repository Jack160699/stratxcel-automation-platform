import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { verifyWhatsAppSocialHandoff } from "@/lib/social/whatsapp-bridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const claims = verifyWhatsAppSocialHandoff(token);
  if (!claims || (claims.op !== "preview" && claims.op !== "edit")) return new NextResponse("This preview link is invalid or expired.", { status: 403 });
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    const resume = `${url.pathname}?token=${encodeURIComponent(token)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(resume)}`, url.origin));
  }
  if (user.id !== claims.sub) return new NextResponse("This preview belongs to a different Stratxcel account.", { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: mapping } = await service.from("social_whatsapp_sessions").select("session_id,tenant_id,principal_type").eq("session_id", claims.session).eq("auth_user_id", user.id).maybeSingle();
  if (!mapping || mapping.tenant_id !== claims.tenant) return new NextResponse("Mission access was revoked or is unavailable.", { status: 403 });
  if (mapping.principal_type === "client") {
    const destination = `/app/social/copilot?handoff=${encodeURIComponent(token)}`;
    return NextResponse.redirect(new URL(destination, url.origin));
  }
  const destination = `/admin/copilot?context=social&session=${encodeURIComponent(claims.session)}&mode=${claims.op}`;
  return NextResponse.redirect(new URL(destination, url.origin));
}
