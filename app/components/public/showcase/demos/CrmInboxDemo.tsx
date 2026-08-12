"use client";

import { useState } from "react";
import { ConversationRow } from "@/components/crm/ConversationRow";
import { ChatBubble } from "@/components/crm/ChatBubble";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_INBOX, DEMO_THREAD } from "../fixtures/showcase-data";

export function CrmInboxDemo() {
  const [selectedId, setSelectedId] = useState(DEMO_INBOX[0]?.lead.id ?? "");
  return (
    <DashboardFrame activeNav="Leads & CRM" title="Leads & CRM">
      <div className="flex min-h-[240px] flex-col sm:flex-row">
        <div className="w-full shrink-0 border-b border-sx-border sm:w-[38%] sm:border-b-0 sm:border-r">
          <p className="border-b border-sx-border px-2 py-1.5 font-sx-sans text-[10px] font-semibold text-sx-text">Inbox · {DEMO_INBOX.length} conversations</p>
          <div className="max-h-[200px] overflow-y-auto p-1 sm:max-h-none">
            {DEMO_INBOX.map((entry) => (
              <ConversationRow key={entry.lead.id} entry={entry} selected={entry.lead.id === selectedId} onClick={() => setSelectedId(entry.lead.id)} />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="border-b border-sx-border px-3 py-1.5 font-sx-sans text-[10px] font-medium text-sx-text">
            {DEMO_INBOX.find((e) => e.lead.id === selectedId)?.lead.contact_name ?? "Conversation"}
          </p>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {selectedId === "lead-1" ? DEMO_THREAD.map((msg) => <ChatBubble key={msg.id} message={msg} />) : <p className="text-[10px] text-sx-text-subtle">Select a conversation to preview the thread.</p>}
          </div>
        </div>
      </div>
    </DashboardFrame>
  );
}
