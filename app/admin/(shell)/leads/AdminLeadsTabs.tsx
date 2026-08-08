"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
import { SEND_READY, SEND_DISABLED_REASON } from "@/components/crm/send-readiness";

type Tab = "crm" | "website";

/**
 * Primary tab: the real, tenant-scoped CRM/inbox for whichever client the
 * ClientSwitcher currently has selected — the same CrmWorkspace /app/crm
 * uses, not a separate "admin CRM." Secondary tab: Stratxcel's own website
 * contact-form inbox (stratxcel_contact_messages), preserved exactly as it
 * was (server-rendered by the page, passed in as `websiteInquiries`).
 *
 * Tab state is driven by the URL (`?tab=crm|website`), not local component
 * state — the default (query param absent, or any value other than
 * "website") is always "crm", so this is unambiguous, shareable, and
 * survives a reload the same way every time. This exists specifically
 * because "Admin Leads must default to CRM leads, not website inquiries"
 * is a mandatory acceptance requirement.
 */
export function AdminLeadsTabs({ websiteInquiries, websiteInquiryCount }: { websiteInquiries: ReactNode; websiteInquiryCount: number }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { active } = useCurrentTenant();

  const tab: Tab = searchParams.get("tab") === "website" ? "website" : "crm";

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "crm") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-1 border-b border-sx-border px-1">
        <TabButton active={tab === "crm"} onClick={() => setTab("crm")}>
          CRM
        </TabButton>
        <TabButton active={tab === "website"} onClick={() => setTab("website")}>
          Website inquiries {websiteInquiryCount > 0 ? `(${websiteInquiryCount})` : ""}
        </TabButton>
      </div>

      {tab === "crm" ? (
        active ? (
          <div className="min-h-0 flex-1">
            <CrmWorkspace
              tenantId={active.tenantId}
              role={active.role}
              title="CRM"
              sendReady={SEND_READY}
              sendDisabledReason={SEND_DISABLED_REASON}
            />
          </div>
        ) : (
          <p className="p-4 text-sm text-sx-text-subtle">Select a client above to view their CRM.</p>
        )
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
