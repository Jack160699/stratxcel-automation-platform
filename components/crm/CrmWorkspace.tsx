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
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { contactLabel, type Appointment, type ConversationAutomationMode, type CrmConversation, type CrmLead, type CrmMessage, type FollowUp, type InboxEntry, type LeadStatus } from "./types";

const LIST_POLL_MS = 8_000;
const THREAD_POLL_MS = 4_000;
/** min-width: 768px — matches Tailwind's `md:` breakpoint used throughout this workspace for the single list/chat split. Desktop-only behaviors (auto-select, no mobile-style deselected state) key off the same breakpoint so JS behavior and CSS layout never disagree about what counts as "desktop". */
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

/**
 * The one CRM/inbox workspace — used identically by /app/crm and
 * /admin/leads (scoped to whichever client the admin's ClientSwitcher has
 * selected). Real crm_leads + whatsapp_conversations + whatsapp_messages
 * only; whatsapp_shadow_messages never enters this component tree.
 *
 * Layout: two panes (conversation list + chat) at >=768px, single pane
 * (list OR chat, tap to switch) below it. Lead details are ALWAYS an
 * overlay — a right-side Drawer at >=768px, a bottom Modal sheet below it —
 * never a permanent third column. A previous pass added a persistent
 * xl+ third column; that made the center chat too narrow and details too
 * wide for how rarely it's the primary focus, so it was removed in favor of
 * an on-demand drawer (closer to WhatsApp Web's own "info" panel behavior).
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
  role: TenantRole | null;
  initialLeadId?: string | null;
  onLeadSelected?: (leadId: string | null) => void;
  /** When set, deep-links leads to `${leadHrefBase}/${leadId}` (used by /app/crm). Omit to keep selection purely in-page (used by /admin/leads). */
  leadHrefBase?: string;
  title?: string;
  sendReady?: boolean;
  sendDisabledReason?: string;
}) {
  const canManage = role !== null && can(role, "crm:manage");
  const canSendMessages = role !== null && can(role, "whatsapp:send") && sendReady;
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    async function loadUserId() {
      const { data } = await createSupabaseBrowserClient().auth.getUser();
      setCurrentUserId(data.user?.id ?? null);
    }
    loadUserId();
  }, []);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [conversations, setConversations] = useState<CrmConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId ?? null);
  const [autoSelected, setAutoSelected] = useState(false);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sending, setSending] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  // Details is always an overlay now (Drawer/Modal, never a permanent
  // column) and always starts closed — no localStorage persistence, so a
  // previous deployment's "open by default" preference can never carry
  // over and no session accidentally opens straight into a drawer.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialLeadId ? "thread" : "list");

  function toggleDetails() {
    setDetailsOpen((prev) => !prev);
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

  // Desktop default selection: explicit route leadId always wins (handled by
  // the initial state above); otherwise, once entries have actually loaded,
  // pick the most recently active conversation, or the first lead if none
  // has a conversation yet. Never runs on mobile (the list is the intended
  // landing view there) and never overrides a selection the user already
  // made or navigated to. `autoSelected` guards against re-running after the
  // user deliberately clears a selection (no such action exists today, but
  // keeps this effect from fighting a future one).
  useEffect(() => {
    if (!isDesktop || autoSelected || leads === null) return;
    setAutoSelected(true);
    const stillValid = selectedLeadId && entries.some((e) => e.lead.id === selectedLeadId);
    if (stillValid) return;
    if (entries.length === 0) return;
    const withConvo = entries.filter((e) => e.conversation);
    const mostRecent = [...withConvo].sort((a, b) => (b.conversation!.last_message_at ?? "").localeCompare(a.conversation!.last_message_at ?? ""))[0];
    const target = mostRecent ?? entries[0];
    setSelectedLeadId(target.lead.id);
    onLeadSelected?.(target.lead.id);
    // Intentionally no router.replace here — auto-selecting the default
    // conversation is not a navigation the URL needs to reflect; only an
    // explicit user click (selectLead below) updates the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, leads, entries, autoSelected]);

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
    setAutoSelected(true);
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg">
      {error && (
        <div className="shrink-0 p-2">
          <ErrorState message={error} onRetry={loadLists} />
        </div>
      )}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,330px)_1fr]">
        <div className={`min-h-0 min-w-0 w-full max-w-full overflow-x-hidden ${mobileView === "list" ? "flex" : "hidden"} md:flex`}>
          <ConversationList entries={entries} loading={leads === null} selectedLeadId={selectedLeadId} onSelect={selectLead} currentUserId={currentUserId} title={title} />
        </div>

        <div className={`min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden ${mobileView === "thread" ? "flex" : "hidden"} md:flex`}>
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
          ) : leads === null ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm text-sx-text-subtle">Loading…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6">
              <EmptyState title="No leads yet." subtitle="New WhatsApp inquiries and leads will show up here." />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm text-sx-text-subtle">Select a conversation to view messages.</p>
            </div>
          )}
        </div>
      </div>

      {/* Lead details is always an overlay — a right-side Drawer at >=768px, a
          bottom Modal sheet below it — never a permanent third column, and
          never open by default. */}
      {selectedEntry && (
        <>
          <div className="hidden md:block">
            <Drawer open={detailsOpen} onClose={toggleDetails} widthClassName="w-[360px]">
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
