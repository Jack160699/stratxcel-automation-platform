import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getActionPreview } from "@/lib/social/agent/action-preview";
import { getSessionDetail, listSessions } from "@/lib/social/repositories/agent";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { resolveEffectiveProviderIdentity } from "@/lib/social/agent/provider";
import type { OwnerContext } from "@/lib/social/db-context";
import { requireClientContext } from "@/lib/tenants/client-context";
import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import { signWhatsAppSocialHandoff, verifyWhatsAppSocialHandoff } from "@/lib/social/whatsapp-bridge";
import { WhatsAppSocialReview } from "./WhatsAppSocialReview";
import { TenantCopilotFullPage } from "./TenantCopilotFullPage";
import { CopilotProvider } from "../../../admin/(shell)/social/copilot/CopilotContext";
import "../../../admin/(shell)/social/social-components.css";

/**
 * The customer-facing Social Copilot — the tenant-scoped counterpart of
 * /admin/(shell)/copilot?context=social. See lib/social/agent-tenant-context.ts
 * for the isolation model: every read/write here is re-derived from the
 * caller's own tenant_members row, never trusted from a client-supplied
 * tenantId, and never shares a database row with the admin/owner-scoped
 * Social Copilot (mutually exclusive owner_id/tenant_id by CHECK
 * constraint).
 */
export default async function ClientSocialCopilotPage({ searchParams }: { searchParams: Promise<{ handoff?: string }> }) {
  const { handoff = "" } = await searchParams;

  // WhatsApp handoff path — unchanged from before this migration; not
  // touched here. Flagged in the migration report as a separate area
  // worth its own dedicated security review (it currently authorizes
  // purely via the signed handoff claims + social_whatsapp_sessions
  // mapping, constructing its own OwnerContext directly rather than going
  // through requireAgentTenantContext).
  if (handoff) {
    const claims = verifyWhatsAppSocialHandoff(handoff);
    if (!claims || (claims.op !== "preview" && claims.op !== "edit")) return <p className="p-8">This mission link is invalid or expired.</p>;
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/app/social/copilot?handoff=${handoff}`)}`);
    if (user.id !== claims.sub) return <p className="p-8">This mission belongs to another account.</p>;
    const service = createSupabaseServiceClient();
    const { data: mapping } = await service.from("social_whatsapp_sessions").select("tenant_id,principal_type").eq("session_id", claims.session).eq("auth_user_id", user.id).maybeSingle();
    if (!mapping || mapping.principal_type !== "client" || mapping.tenant_id !== claims.tenant) return <p className="p-8">Mission access is unavailable.</p>;
    const ctx: OwnerContext = { ok: true, ownerId: user.id, email: user.email ?? null, supabase: service as OwnerContext["supabase"] };
    const detail = await getSessionDetail(ctx, claims.session);
    const previews = (await Promise.all(detail.actions.filter((action) => action.status === "PROPOSED").map((action) => getActionPreview(ctx, action.id)))).filter((preview) => preview !== null);
    const tokenFor = (op: "approve" | "edit" | "cancel") => signWhatsAppSocialHandoff({ sub: user.id, tenant: claims.tenant, session: claims.session, op });
    return <WhatsAppSocialReview previews={previews} handoffToken={handoff} approveToken={tokenFor("approve")} editToken={tokenFor("edit")} cancelToken={tokenFor("cancel")} />;
  }

  const clientCtx = await requireClientContext();
  if (!clientCtx.ok) redirect("/login?next=%2Fapp%2Fsocial%2Fcopilot");
  if (clientCtx.accessMode === "staff_support") {
    return (
      <div className="p-8 text-sm" style={{ color: "var(--sx-text-muted, #666)" }}>
        Staff workspace viewing isn&apos;t supported for the customer Social Copilot — use the admin Copilot
        (Social context) instead.
      </div>
    );
  }

  const tenantId = clientCtx.workspaceTenant.tenantId;
  const ctx = await requireAgentTenantContext(tenantId);
  if (!ctx.ok) return null;

  const [sessions, variants] = await Promise.all([listSessions(ctx, 30), listRecentVariants(ctx, 8)]);

  return (
    <CopilotProvider>
      <TenantCopilotFullPage
        tenantId={tenantId}
        initialSessions={sessions}
        initialVariants={variants}
        provider={resolveEffectiveProviderIdentity()}
      />
    </CopilotProvider>
  );
}
