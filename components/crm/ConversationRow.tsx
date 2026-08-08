import { contactLabel, LEAD_STATUS_LABEL, type InboxEntry } from "./types";

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  website_form: "Website",
  manual: "Manual",
  import: "Import",
};

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (abs < minute) return "now";
  if (abs < hour) return RELATIVE.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return RELATIVE.format(Math.round(diffMs / hour), "hour");
  if (abs < 7 * day) return RELATIVE.format(Math.round(diffMs / day), "day");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string | null): string {
  if (!name) return "#";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "#";
}

/** One row in the inbox list — messaging-app density, not a floating card. Everything a staff member needs to triage is visible without opening the row: who, latest message, when, unread, and a subtle pipeline-stage hint. */
export function ConversationRow({ entry, selected, onClick }: { entry: InboxEntry; selected: boolean; onClick: () => void }) {
  const { lead, conversation } = entry;
  const unread = conversation?.unread_count ?? 0;
  const preview = conversation?.last_message_preview ?? lead.notes ?? "No messages yet";
  const timestamp = conversation?.last_message_at ?? lead.created_at;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-start gap-2.5 rounded-sx-sm px-2.5 py-2.5 text-left transition-colors ${
        selected ? "bg-sx-accent-muted" : "hover:bg-sx-surface-2"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sx-surface-3 font-sx-sans text-[12px] font-semibold text-sx-text-muted">
        {initials(lead.contact_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[13.5px] ${unread > 0 ? "font-semibold text-sx-text" : "font-medium text-sx-text"}`}>{contactLabel(lead)}</p>
          <span className="shrink-0 font-sx-mono text-[10px] text-sx-text-subtle">{relativeTime(timestamp)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`min-w-0 flex-1 truncate text-[12px] ${unread > 0 ? "text-sx-text-muted" : "text-sx-text-subtle"}`}>{preview}</p>
          {unread > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sx-pill bg-sx-accent px-1 font-sx-mono text-[9.5px] font-semibold text-sx-accent-on">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="font-sx-mono text-[9px] uppercase tracking-[0.08em] text-sx-text-subtle">{SOURCE_LABEL[lead.source] ?? lead.source}</span>
          <span className="text-sx-text-subtle" aria-hidden="true">·</span>
          <span className="text-[10px] text-sx-text-subtle">{LEAD_STATUS_LABEL[lead.status]}</span>
        </div>
      </div>
    </button>
  );
}
