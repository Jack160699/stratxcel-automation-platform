"use client";

import { IconButton } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { LEAD_STATUS_LABEL, contactLabel, formatPhone, type ConversationAutomationMode, type CrmConversation, type CrmLead } from "./types";

const AUTOMATION_LABEL: Record<ConversationAutomationMode, string> = {
  automated: "Automated",
  human_only: "Human only",
  paused: "Paused",
  handoff: "Handoff",
};

/** Sticky header above the chat thread — contact identity + a compact set of quick actions. Deliberately not overloaded (per the design brief): details toggle, automation take-over/resume, and a details-panel entry point only. */
export function ConversationHeader({
  lead,
  conversation,
  detailsOpen,
  onToggleDetails,
  onBack,
  canManage,
  automationBusy,
  onSetAutomationMode,
}: {
  lead: CrmLead;
  conversation: CrmConversation | null;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onBack?: () => void;
  canManage: boolean;
  automationBusy: boolean;
  onSetAutomationMode: (mode: ConversationAutomationMode) => void;
}) {
  const mode = conversation?.automation_mode ?? "automated";
  const isHumanOwned = mode === "human_only" || mode === "handoff";

  return (
    <div className="flex w-full min-w-0 shrink-0 items-center gap-3 border-b border-sx-border bg-sx-surface-1 px-4 py-2.5">
      {onBack && (
        <IconButton label="Back to conversations" onClick={onBack} className="md:hidden">
          <BackIcon />
        </IconButton>
      )}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sx-surface-3 font-sx-sans text-[13px] font-semibold text-sx-text-muted">
        {initials(lead)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-sx-text">{contactLabel(lead)}</p>
        <div className="flex items-center gap-1.5 text-[11.5px] text-sx-text-subtle">
          {lead.contact_name && lead.contact_phone && <span>{formatPhone(lead.contact_phone)}</span>}
          <span aria-hidden="true">·</span>
          <StatusChip state={mode === "automated" ? "success" : mode === "paused" ? "neutral" : "warning"} dot={false} className="h-4 px-1.5 text-[9px]">
            {AUTOMATION_LABEL[mode]}
          </StatusChip>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusChip state="neutral" dot={false} className="hidden h-5 px-2 text-[10px] sm:inline-flex">
          {LEAD_STATUS_LABEL[lead.status]}
        </StatusChip>
        {canManage && (
          <button
            type="button"
            disabled={automationBusy}
            onClick={() => onSetAutomationMode(isHumanOwned ? "automated" : "human_only")}
            className="hidden rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-sx-text-muted transition-colors hover:bg-sx-surface-3 hover:text-sx-text disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          >
            {automationBusy ? "…" : isHumanOwned ? "Resume automation" : "Take over"}
          </button>
        )}
        <IconButton label={detailsOpen ? "Hide contact details" : "Show contact details"} onClick={onToggleDetails} aria-pressed={detailsOpen}>
          <InfoIcon />
        </IconButton>
      </div>
    </div>
  );
}

function initials(lead: CrmLead): string {
  if (lead.contact_name) {
    const parts = lead.contact_name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "?";
  }
  return "#";
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 3.5L5 9l6 5.5" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 8.2v4M9 5.8h.01" strokeLinecap="round" />
    </svg>
  );
}
