"use client";

import { useMemo, useState } from "react";
import { ConversationRow } from "./ConversationRow";
import { EmptyState } from "@/components/ui/Feedback";
import { formatPhone, type InboxEntry } from "./types";

type Filter = "all" | "unread" | "mine" | "unassigned";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
];

/** Left column — search + simple filters + the row list. Deliberately not an enterprise filter builder: four buttons, one search box, matching the "understand it within 5 seconds" goal. */
export function ConversationList({
  entries,
  loading,
  selectedLeadId,
  onSelect,
  currentUserId,
  title = "CRM",
}: {
  entries: InboxEntry[];
  loading: boolean;
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  currentUserId: string | null;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let list = entries;
    if (filter === "unread") list = list.filter((e) => (e.conversation?.unread_count ?? 0) > 0);
    else if (filter === "mine") list = list.filter((e) => currentUserId && e.lead.assigned_to === currentUserId);
    else if (filter === "unassigned") list = list.filter((e) => !e.lead.assigned_to);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const haystack = [
          e.lead.contact_name,
          e.lead.contact_phone,
          formatPhone(e.lead.contact_phone),
          e.lead.contact_email,
          e.conversation?.last_message_preview,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return [...list].sort((a, b) => {
      const at = a.conversation?.last_message_at ?? a.lead.created_at;
      const bt = b.conversation?.last_message_at ?? b.lead.created_at;
      return bt.localeCompare(at);
    });
  }, [entries, filter, query, currentUserId]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden border-r border-sx-border bg-sx-surface-1">
      <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-sx-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h1 className="font-sx-sans text-base font-semibold text-sx-text">{title}</h1>
        </div>
        <div className="relative w-full min-w-0">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sx-text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, or message…"
            className="box-border h-8 w-full min-w-0 max-w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 pl-8 pr-2.5 text-[12.5px] text-sx-text placeholder:text-sx-text-subtle outline-none focus-visible:border-sx-accent"
          />
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-sx-pill px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.key ? "bg-sx-accent-muted text-sx-accent" : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sx-thin-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 py-1.5">
        {loading && entries.length === 0 && <p className="px-2 py-4 text-center text-xs text-sx-text-subtle">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="px-2 py-4">
            <EmptyState
              title={entries.length === 0 ? "No conversations yet." : "No matches."}
              subtitle={entries.length === 0 ? "New WhatsApp inquiries and leads will show up here." : "Try a different search or filter."}
            />
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {filtered.map((entry) => (
            <ConversationRow key={entry.lead.id} entry={entry} selected={entry.lead.id === selectedLeadId} onClick={() => onSelect(entry.lead.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M15.5 15.5l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
