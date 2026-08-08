"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "./ChatBubble";
import type { CrmMessage } from "./types";

const NEAR_BOTTOM_PX = 120;

/** Groups messages into date-separated sections and renders the scrollable chat log — newest at the bottom, auto-scrolls on new arrivals only while the reader is already near the bottom, otherwise surfaces a non-intrusive "New messages" control rather than yanking their scroll position. */
export function ChatThread({ messages, loading }: { messages: CrmMessage[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const prevCount = useRef(0);
  const prevConversationLen = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;

    if (prevConversationLen.current === null) {
      // First render for this thread — jump straight to newest, no animation.
      el.scrollTop = el.scrollHeight;
      prevConversationLen.current = messages.length;
      return;
    }

    if (grew) {
      if (pinnedToBottom) {
        el.scrollTop = el.scrollHeight;
      } else {
        // Genuinely synchronizing with an external system (DOM scroll
        // position) rather than deriving state from props — same accepted
        // pattern as components/shell/Sidebar.tsx's localStorage read.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHasNewBelow(true);
      }
    }
  }, [messages, pinnedToBottom]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setPinnedToBottom(nearBottom);
    if (nearBottom) setHasNewBelow(false);
  }

  function jumpToBottom() {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setHasNewBelow(false);
    setPinnedToBottom(true);
  }

  const sections = groupByDay(messages);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-4">
        {loading && messages.length === 0 && <p className="text-center text-xs text-sx-text-subtle">Loading conversation…</p>}
        {!loading && messages.length === 0 && <p className="text-center text-xs text-sx-text-subtle">No messages yet.</p>}
        <div className="flex flex-col gap-1">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <div className="sticky top-0 z-10 my-2 flex justify-center">
                <span className="rounded-sx-pill bg-sx-surface-2 px-2.5 py-1 font-sx-mono text-[10px] uppercase tracking-[0.08em] text-sx-text-subtle">{section.label}</span>
              </div>
              {section.messages.map((m) => (
                <div key={m.id} className="py-0.5">
                  <ChatBubble message={m} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {hasNewBelow && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sx-pill border border-sx-border-strong bg-sx-elevated px-3 py-1.5 text-[11.5px] font-medium text-sx-text shadow-[var(--sx-shadow-lg)] hover:bg-sx-surface-3"
        >
          ↓ New messages
        </button>
      )}
    </div>
  );
}

function dayLabel(date: Date, today: Date): string {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round((t0 - d0) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function groupByDay(messages: CrmMessage[]): { label: string; messages: CrmMessage[] }[] {
  const now = new Date();
  const sections: { label: string; messages: CrmMessage[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(new Date(m.created_at), now);
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.messages.push(m);
    else sections.push({ label, messages: [m] });
  }
  return sections;
}
