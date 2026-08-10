import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildClientPrincipal } from "@stratxcel/agent-core";
import { decideWhatsAppSocialMission, verifyWhatsAppSocialHandoff } from "@/lib/social/whatsapp-bridge";
import { editProposedPublishAction } from "@/lib/social/agent/action-preview";
import type { OwnerContext } from "@/lib/social/db-context";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown; operation?: unknown; actionId?: unknown; caption?: unknown };
  if (typeof body.token !== "string" || !["approve", "edit", "cancel"].includes(String(body.operation))) return Response.json({ error: "Invalid action" }, { status: 400 });
  const operation = body.operation as "approve" | "edit" | "cancel";
  const claims = verifyWhatsAppSocialHandoff(body.token, { operation });
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!claims || !user || user.id !== claims.sub || !claims.tenant) return Response.json({ error: "Not authorized" }, { status: 403 });
  const service = createSupabaseServiceClient();
  const { data: membership } = await service.from("tenant_members").select("role").eq("tenant_id", claims.tenant).eq("user_id", user.id).maybeSingle();
  if (!membership) return Response.json({ error: "Membership is no longer active" }, { status: 403 });
  const principal = buildClientPrincipal({ authUserId: user.id, tenantId: claims.tenant, role: membership.role, channel: "client_web" });
  if (operation === "edit") {
    if (typeof body.actionId !== "string" || typeof body.caption !== "string" || body.caption.length > 10000) return Response.json({ error: "Invalid edit" }, { status: 400 });
    const { data: mapping } = await service.from("social_whatsapp_sessions").select("session_id").eq("session_id", claims.session).eq("auth_user_id", user.id).maybeSingle();
    const { data: action } = await service.from("social_agent_actions").select("session_id").eq("id", body.actionId).maybeSingle();
    if (!mapping || action?.session_id !== claims.session) return Response.json({ error: "Mission action not found" }, { status: 404 });
    const ctx: OwnerContext = { ok: true, ownerId: user.id, email: user.email ?? null, supabase: service as OwnerContext["supabase"] };
    try { return Response.json({ preview: await editProposedPublishAction(ctx, body.actionId, { caption: body.caption.trim() }) }); }
    catch { return Response.json({ error: "This post can no longer be edited" }, { status: 409 }); }
  }
  try { return Response.json(await decideWhatsAppSocialMission({ supabase: service, principal, token: body.token, operation })); }
  catch { return Response.json({ error: "This action is invalid, expired, or already unavailable" }, { status: 409 }); }
}
