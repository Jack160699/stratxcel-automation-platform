"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { can } from "@/lib/rbac/policy";
import type { TenantRole } from "@/lib/tenants/types";
import { ConversationList } from "./ConversationList";
import { ConversationHeader } from "./ConversationHeader";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { LeadDetailsPanel } from "./LeadDetailsPanel";
import { ErrorState } from "@/components/ui/Feedback";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { contactLabel, type Appointment, type ConversationAutomationMode, type CrmConversation, type CrmLead, type CrmMessage, type FollowUp, type InboxEntry, type LeadStatus } from "./types";

const LIST_POLL_MS = 8_000;
const THREAD_POLL_MS = 4_000;
const DETAILS_PANEL_KEY = "sx-crm-details-open";

/**
 * The one CRM/inbox workspace — used identically by /app/crm and
 * /admin/leads (scoped to whichever client the admin's ClientSwitcher has
 * selected). Real crm_leads + whatsapp_conversations + whatsapp_messages
 * only; whatsapp_shadow_messages never enters this component tree.
 */
export function CrmWorkspace({
  tenantId,
  role,
  initialLeadId,
  onLeadSelected,
  leadHrefBase,
  title = "CRM",
  sendReady = false,
  sendDisabledReason,
}: {
  tenantId: string;
  role: TenantRole;
  initialLeadId?: string | null;
  onLeadSelected?: (leadId: string | null) => void;
  /** When set, deep-links leads to `${leadHrefBase}/${leadId}` (used by /app/crm). Omit to keep selection purely in-page (used by /admin/leads). */
  leadHrefBase?: string;
  title?: string;
  sendReady?: boolean;
  sendDisabledReason?: string;
}) {
  const canManage = can(role, "crm:manage");
  const canSendMessages = can(role, "whatsapp:send") && sendReady;
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    async function loadUserId() {
      const { data } = await createSupabaseBrowserClient().auth.getUser();
      setCurrentUserId(data.user?.id ?? null);
    }
    loadUserId();
  }, []);

  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [conversations, setConversations] = useState<CrmConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId ?? null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sending, setSending] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialLeadId ? "thread" : "list");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(DETAILS_PANEL_KEY) : null;
    if (stored !== null) setDetailsOpen(stored === "1");
  }, []);

  function toggleDetails() {
    setDetailsOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(DETAILS_PANEL_KEY, next ? "1" : "0");
      return next;
    });
  }

  const loadLists = useCallback(async () => {
    const [leadsRes, convosRes, followUpsRes, appointmentsRes] = await Promise.all([
      fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/whatsapp/conversations?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/crm/follow-ups?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/crm/appointments?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    if (!leadsRes.ok) {
      const body = await leadsRes.json().catch(() => ({}));
      setError(body.error ?? `Failed to load leads (HTTP ${leadsRes.status})`);
      return;
    }
    const leadsBody = await leadsRes.json();
    setLeads(leadsBody.leads);

    if (convosRes.ok) setConversations((await convosRes.json()).conversations);
    if (followUpsRes.ok) setFollowUps((await followUpsRes.json()).followUps ?? []);
    if (appointmentsRes.ok) setAppointments((await appointmentsRes.json()).appointments ?? []);
    setError(null);
  }, [tenantId]);

  useEffect(() => {
    loadLists();
    const interval = setInterval(() => {
      if (!document.hidden) loadLists();
    }, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [loadLists]);

  const entries: InboxEntry[] = useMemo(() => {
    if (!leads) return [];
    const convoByLead = new Map<string, CrmConversation>();
    for (const c of conversations ?? []) convoByLead.set(c.lead_id, c);
    return leads.map((lead) => ({ lead, conversation: convoByLead.get(lead.id) ?? null }));
  }, [leads, conversations]);

  const selectedEntry = entries.find((e) => e.lead.id === selectedLeadId) ?? null;
  const conversationId = selectedEntry?.conversation?.id ?? null;

  const loadMessages = useCallback(
    async (convoId: string, showLoading: boolean) => {
      if (showLoading) setMessagesLoading(true);
      try {
        const res = await fetch(`/api/platform/whatsapp/conversations/${convoId}?tenantId=${encodeURIComponent(tenantId)}`);
        if (res.ok) {
          const body = await res.json();
          setMessages(body.messages ?? []);
        }
      } finally {
        if (showLoading) setMessagesLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    loadMessages(conversationId, true);
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadMessages(conversationId, false);
        loadLists(); // keeps unread badges / previews for the rest of the list in sync too
      }
    }, THREAD_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, loadMessages]);

  function selectLead(leadId: string) {
    setSelectedLeadId(leadId);
    setMobileView("thread");
    onLeadSelected?.(leadId);
    if (leadHrefBase) router.replace(`${leadHrefBase}/${leadId}`, { scroll: false });
    // Optimistically zero the unread badge — the GET above marks it read server-side.
    setConversations((prev) => (prev ? prev.map((c) => (c.lead_id === leadId ? { ...c, unread_count: 0 } : c)) : prev));
  }

  async function handleSend(text: string): Promise<boolean> {
    if (!selectedEntry) return false;
    setSending(true);
    try {
      const res = await fetch("/api/platform/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, leadId: selectedEntry.lead.id, text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Message could not be sent");
        return false;
      }
      if (conversationId) await loadMessages(conversationId, false);
      await loadLists();
      return true;
    } finally {
      setSending(false);
    }
  }

  async function handleSetAutomationMode(mode: ConversationAutomationMode) {
    if (!conversationId) return;
    setAutomationBusy(true);
    try {
      await fetch(`/api/platform/whatsapp/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, automationMode: mode }),
      });
      await loadLists();
    } finally {
      setAutomationBusy(false);
    }
  }

  async function patchLead(patch: Record<string, unknown>) {
    if (!selectedEntry) return;
    const res = await fetch(`/api/platform/leads/${selectedEntry.lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, ...patch }),
    });
    if (res.ok) await loadLists();
  }

  const detailsContent = selectedEntry ? (
    <LeadDetailsPanel
      lead={selectedEntry.lead}
      followUps={followUps.filter((f) => f.lead_id === selectedEntry.lead.id)}
      appointments={appointments.filter((a) => a.lead_id === selectedEntry.lead.id)}
      canManage={canManage}
      onClose={toggleDetails}
      onUpdateStatus={async (status: LeadStatus) => patchLead({ status })}
      onSaveNotes={async (notes: string) => patchLead({ notes })}
      onAssignToMe={async () => patchLead({ assignedTo: "self" })}
      onScheduleFollowUp={async (nextAction: string, dueAt: string) => {
        await fetch("/api/platform/crm/follow-ups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, leadId: selectedEntry.lead.id, nextAction, dueAt }),
        });
        await loadLists();
      }}
      onScheduleAppointment={async (requestedFor: string) => {
        await fetch("/api/platform/crm/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, leadId: selectedEntry.lead.id, requestedFor: requestedFor || undefined }),
        });
        await loadLists();
      }}
    />
  ) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg">
      {error && (
        <div className="shrink-0 p-2">
          <ErrorState message={error} onRetry={loadLists} />
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,320px)_1fr] xl:grid-cols-[minmax(280px,320px)_1fr_minmax(280px,320px)]">
        <div className={`min-h-0 ${mobileView === "list" ? "flex" : "hidden"} md:flex`}>
          <ConversationList entries={entries} loading={leads === null} selectedLeadId={selectedLeadId} onSelect={selectLead} currentUserId={currentUserId} title={title} />
        </div>

        <div className={`min-h-0 flex-col ${mobileView === "thread" ? "flex" : "hidden"} md:flex`}>
          {selectedEntry ? (
            <>
              <ConversationHeader
                lead={selectedEntry.lead}
                conversation={selectedEntry.conversation}
                detailsOpen={detailsOpen}
                onToggleDetails={toggleDetails}
                onBack={() => {
                  setMobileView("list");
                  if (leadHrefBase) router.replace(leadHrefBase, { scroll: false });
                }}
                canManage={canManage}
                automationBusy={automationBusy}
                onSetAutomationMode={handleSetAutomationMode}
              />
              {selectedEntry.conversation ? (
                <>
                  <ChatThread messages={messages} loading={messagesLoading} />
                  <ChatComposer enabled={canSendMessages} disabledReason={sendDisabledReason} sending={sending} onSend={handleSend} />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <p className="text-sm text-sx-text-subtle">No WhatsApp conversation yet for this lead. It will appear here as soon as they message in.</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm text-sx-text-subtle">Select a conversation to view messages.</p>
            </div>
          )}
        </div>

        {selectedEntry && detailsOpen && (
          <div className="hidden min-h-0 xl:block">{detailsContent}</div>
        )}
      </div>

      {/* Below the xl breakpoint the persistent third column has no room — the
          same panel content renders as an overlay instead (Drawer on tablet/
          small-desktop, bottom sheet on mobile), matching
          docs/product-design/SHARED_SHELL_SPECIFICATION.md §4's breakpoint
          behavior for the shell's right context panel in general. */}
      {selectedEntry && (
        <>
          <div className="hidden md:block xl:hidden">
            <Drawer open={detailsOpen} onClose={toggleDetails} widthClassName="w-[340px]">
              <div className="h-full">{detailsOpen && detailsContent}</div>
            </Drawer>
          </div>
          <div className="md:hidden">
            <Modal open={detailsOpen} onClose={toggleDetails} title={contactLabel(selectedEntry.lead)}>
              <div className="max-h-[75vh] overflow-y-auto">{detailsOpen && detailsContent}</div>
            </Modal>
          </div>
        </>
      )}
    </div>
  );
}
