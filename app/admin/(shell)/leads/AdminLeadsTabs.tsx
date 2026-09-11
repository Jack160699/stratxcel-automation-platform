"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
import { LeadsPipelineTable } from "@/components/crm/LeadsPipelineTable";
import { SEND_READY, SEND_DISABLED_REASON } from "@/components/crm/send-readiness";

type Tab = "conversations" | "leads" | "website";

/**
 * Clean CRM Data Model & Workspace:
 * - Tab 1: "conversations" (WhatsApp Conversations) — CrmWorkspace displaying ONLY leads
 *   with real active WhatsApp message history. Zero ghost conversations with zero messages.
 * - Tab 2: "leads" (All Leads & Pipeline) — LeadsPipelineTable displaying all discovered
 *   and qualified prospects with 17-dimension diagnosis, canonical offers, and outreach triggers.
 * - Tab 3: "website" (Website Inquiries) — Preserved website contact-form inbox.
 */
export function AdminLeadsTabs({ websiteInquiries, websiteInquiryCount }: { websiteInquiries: ReactNode; websiteInquiryCount: number }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawTab = searchParams.get("tab");
  const tab: Tab = rawTab === "website" ? "website" : rawTab === "leads" ? "leads" : "conversations";

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "conversations") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-1 border-b border-sx-border px-1">
        <TabButton active={tab === "conversations"} onClick={() => setTab("conversations")}>
          WhatsApp Conversations
        </TabButton>
        <TabButton active={tab === "leads"} onClick={() => setTab("leads")}>
          All Leads & Pipeline
        </TabButton>
        <TabButton active={tab === "website"} onClick={() => setTab("website")}>
          Website inquiries {websiteInquiryCount > 0 ? `(${websiteInquiryCount})` : ""}
        </TabButton>
      </div>

      {tab === "conversations" ? (
        <div className="min-h-0 flex-1">
          <CrmWorkspace
            role="owner"
            title="WhatsApp Conversations"
            sendReady={SEND_READY}
            sendDisabledReason={SEND_DISABLED_REASON}
          />
        </div>
      ) : tab === "leads" ? (
        <div className="min-h-0 flex-1">
          <LeadsPipelineTable
            onOpenConversation={(leadId) => {
              const params = new URLSearchParams();
              params.set("tab", "conversations");
              router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            }}
          />
        </div>
      ) : (
        <div className="sx-thin-scroll min-h-0 flex-1 overflow-y-auto">{websiteInquiries}</div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? "text-sx-text" : "text-sx-text-muted hover:text-sx-text"}`}
    >
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-sx-accent" />}
    </button>
  );
}
