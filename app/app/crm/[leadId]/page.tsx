"use client";

import { useParams } from "next/navigation";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
import { SEND_READY, SEND_DISABLED_REASON } from "@/components/crm/send-readiness";

/**
 * Deep link into one lead's conversation — renders the exact same
 * CrmWorkspace as /app/crm with that lead pre-selected, rather than the
 * previous giant vertical stack of five cards (Contact / Notes / Follow-ups
 * / Appointments / "Conversation (proposed replies — shadow mode)"). A
 * bookmark or shared link to /app/crm/<leadId> now opens directly into that
 * person's real chat thread with the details panel alongside it.
 */
export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const { active } = useCurrentTenant();
  if (!active) return <p className="p-4 text-sm text-sx-text-subtle">Loading workspace…</p>;

  return (
    <div className="h-[calc(100vh-152px)] md:h-[calc(100vh-96px)]">
      <CrmWorkspace
        tenantId={active.tenantId}
        role={active.role}
        initialLeadId={params.leadId}
        leadHrefBase="/app/crm"
        sendReady={SEND_READY}
        sendDisabledReason={SEND_DISABLED_REASON}
      />
    </div>
  );
}
