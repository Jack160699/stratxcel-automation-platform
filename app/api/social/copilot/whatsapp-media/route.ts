import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { verifyWhatsAppSocialHandoff } from "@/lib/social/whatsapp-bridge";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const claims = verifyWhatsAppSocialHandoff(url.searchParams.get("token") || "");
  const assetId = url.searchParams.get("assetId");
  if (!claims || !assetId) return Response.json({ error: "Invalid request" }, { status: 403 });
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.id !== claims.sub) return Response.json({ error: "Not authorized" }, { status: 403 });
  const service = createSupabaseServiceClient();
  const [{ data: mapping }, { data: asset }] = await Promise.all([
    service.from("social_whatsapp_sessions").select("session_id,tenant_id").eq("session_id", claims.session).eq("auth_user_id", user.id).maybeSingle(),
    service.from("social_media_assets").select("owner_id,storage_bucket,storage_path,mime_type").eq("id", assetId).eq("owner_id", user.id).eq("status", "READY").maybeSingle(),
  ]);
  if (!mapping || mapping.tenant_id !== claims.tenant || !asset) return Response.json({ error: "Media not found" }, { status: 404 });
  const { data: signed, error } = await service.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 10 * 60);
  if (error || !signed) return Response.json({ error: "Media unavailable" }, { status: 404 });
  return Response.json({ url: signed.signedUrl, mimeType: asset.mime_type }, { headers: { "Cache-Control": "no-store" } });
}
