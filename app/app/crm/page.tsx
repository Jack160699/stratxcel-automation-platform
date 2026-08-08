"use client";

import { useCurrentTenant } from "../CurrentTenantContext";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
import { SEND_READY, SEND_DISABLED_REASON } from "@/components/crm/send-readiness";

/**
 * The unified CRM/inbox workspace — real crm_leads + whatsapp_conversations
 * + whatsapp_messages, not the old shadow-message "proposed replies" view
 * this route used to render (see git history: this file previously showed a
 * DataTable + slide-in panel over the same crm_leads data but with no real
 * conversation UI at all — conversations lived at /app/conversations, which
 * itself only rendered whatsapp_shadow_messages).
 */
export default function CrmPage() {
  const { active } = useCurrentTenant();
  if (!active) return <p className="p-4 text-sm text-sx-text-subtle">Loading workspace…</p>;

  return (
    <div className="h-[calc(100vh-152px)] md:h-[calc(100vh-96px)]">
      <CrmWorkspace tenantId={active.tenantId} role={active.role} leadHrefBase="/app/crm" sendReady={SEND_READY} sendDisabledReason={SEND_DISABLED_REASON} />
    </div>
  );
}
