"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import type { CrmLead } from "./types";

interface ExtendedLeadMetadata {
  company?: string;
  industry?: string;
  facilityLocation?: string;
  painPoint?: string;
  primaryBottleneck?: string;
  recommendedOfferName?: string;
  recommendedOfferKey?: string;
  estimatedDealValueInr?: number;
  startingPriceInr?: number;
  intentScore?: number;
  outreachError?: string;
  outreachFailedAt?: string;
  lastOutreachAt?: string;
  providerMessageId?: string;
  [key: string]: unknown;
}

const STATUS_CHIP_MAP: Record<string, { label: string; state: ChipState }> = {
  DISCOVERED: { label: "Discovered", state: "neutral" },
  NEW: { label: "New", state: "neutral" },
  QUALIFIED: { label: "Qualified", state: "accent" },
  CONTACTED: { label: "Contacted", state: "warning" },
  RESPONDED: { label: "Responded", state: "success" },
  INTERESTED: { label: "Interested", state: "success" },
  OPPORTUNITY: { label: "Opportunity", state: "success" },
  PROPOSAL: { label: "Proposal", state: "warning" },
  WON: { label: "Won", state: "success" },
  LOST: { label: "Lost", state: "danger" },
};

function formatInr(amount?: number | null): string {
  if (!amount && amount !== 0) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function isValidIndianMobile(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  const national = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  return national.length === 10 && /^[6-9]/.test(national);
}

export function LeadsPipelineTable({
  tenantId,
  onOpenConversation,
}: {
  tenantId?: string;
  onOpenConversation?: (leadId: string) => void;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ id: string; message: string; isError?: boolean } | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    const res = await loadCustomerJson<{ leads?: CrmLead[] }>(
      () => platformFetch(`/api/platform/leads${qs}`),
      "Could not load leads."
    );
    setLoading(false);
    if (res.status === "error") {
      setError(res.message);
    } else {
      setLeads(res.data.leads ?? []);
      setError(null);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    let list = leads;

    if (statusFilter !== "ALL") {
      list = list.filter((l) => (l.status || "").toUpperCase() === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) => {
        const meta = (l.metadata || {}) as ExtendedLeadMetadata;
        const haystack = [
          l.contact_name,
          l.contact_phone,
          l.contact_email,
          meta.company,
          meta.industry,
          meta.primaryBottleneck,
          meta.recommendedOfferName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return list;
  }, [leads, statusFilter, search]);

  const metrics = useMemo(() => {
    if (!leads) return { total: 0, qualified: 0, contacted: 0, won: 0 };
    return {
      total: leads.length,
      qualified: leads.filter((l) => ["QUALIFIED", "OPPORTUNITY"].includes((l.status || "").toUpperCase())).length,
      contacted: leads.filter((l) => (l.status || "").toUpperCase() === "CONTACTED").length,
      won: leads.filter((l) => (l.status || "").toUpperCase() === "WON").length,
    };
  }, [leads]);

  async function handleSendSingleOutreach(lead: CrmLead) {
    const meta = (lead.metadata || {}) as ExtendedLeadMetadata;
    setSendingLeadId(lead.id);
    setActionNotice(null);

    try {
      const res = await platformFetch("/api/platform/whatsapp/outbound-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: lead.tenant_id,
          leadIds: [lead.id],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionNotice({ id: lead.id, message: data.error || "Outreach dispatch failed", isError: true });
      } else {
        const itemResult = data.results?.[0];
        if (itemResult?.status === "SENT") {
          setActionNotice({
            id: lead.id,
            message: `Outreach sent via Meta WhatsApp! Provider ID: ${itemResult.providerId || "Accepted"}`,
          });
          await fetchLeads();
        } else {
          setActionNotice({
            id: lead.id,
            message: `Outreach stopped: ${itemResult?.error || data.message || "Unknown error"}`,
            isError: true,
          });
        }
      }
    } catch (err: any) {
      setActionNotice({ id: lead.id, message: err.message || "Network request failed", isError: true });
    } finally {
      setSendingLeadId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-1">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-sx-text-muted">Total Prospects</p>
          <p className="mt-1 font-sx-mono text-xl font-bold text-sx-text">{metrics.total}</p>
          <span className="text-[10px] text-sx-text-subtle">Discovered in CRM</span>
        </Card>
        <Card>
          <p className="text-xs font-medium text-sx-text-muted">ICP Qualified</p>
          <p className="mt-1 font-sx-mono text-xl font-bold text-sx-accent">{metrics.qualified}</p>
          <span className="text-[10px] text-sx-text-subtle">Diagnostic fit score $\ge$ 60</span>
        </Card>
        <Card>
          <p className="text-xs font-medium text-sx-text-muted">Contacted</p>
          <p className="mt-1 font-sx-mono text-xl font-bold text-amber-400">{metrics.contacted}</p>
          <span className="text-[10px] text-sx-text-subtle">WhatsApp outreach dispatched</span>
        </Card>
        <Card>
          <p className="text-xs font-medium text-sx-text-muted">Won Deals</p>
          <p className="mt-1 font-sx-mono text-xl font-bold text-emerald-400">{metrics.won}</p>
          <span className="text-[10px] text-sx-text-subtle">Closed commercial contracts</span>
        </Card>
      </div>

      {/* Action Notice Toast */}
      {actionNotice && (
        <div
          className={`rounded-sx-sm p-3 text-xs font-medium ${
            actionNotice.isError ? "border border-red-500/30 bg-red-950/40 text-red-300" : "border border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
          }`}
        >
          {actionNotice.message}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sx-border pb-3">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company, contact, phone, or bottleneck…"
            className="box-border h-9 w-full max-w-md rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 text-xs text-sx-text placeholder:text-sx-text-subtle outline-none focus-visible:border-sx-accent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {["ALL", "QUALIFIED", "CONTACTED", "DISCOVERED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-sx-pill px-2.5 py-1 text-[11px] font-medium transition-colors ${
                statusFilter === st ? "bg-sx-accent-muted text-sx-accent" : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
              }`}
            >
              {st === "ALL" ? "All Leads" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / List */}
      <div className="sx-thin-scroll min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-xs text-sx-text-subtle">Loading leads…</div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchLeads} />
        ) : filteredLeads.length === 0 ? (
          <EmptyState title="No leads match filter" subtitle="Try changing your search keywords or status filter." />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredLeads.map((lead) => {
              const meta = (lead.metadata || {}) as ExtendedLeadMetadata;
              const chip = STATUS_CHIP_MAP[(lead.status || "").toUpperCase()] || { label: lead.status || "Unknown", state: "neutral" as ChipState };
              const isMobile = isValidIndianMobile(lead.contact_phone);
              const isSending = sendingLeadId === lead.id;

              return (
                <Card key={lead.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sx-text">{meta.company || lead.contact_name}</span>
                        {meta.company && lead.contact_name && meta.company !== lead.contact_name && (
                          <span className="text-xs text-sx-text-muted">({lead.contact_name})</span>
                        )}
                        <StatusChip state={chip.state}>{chip.label}</StatusChip>
                        {meta.intentScore !== undefined && (
                          <span className="rounded-sx-xs bg-sx-surface-2 px-1.5 py-0.5 font-sx-mono text-[10px] text-sx-accent">
                            Score: {meta.intentScore}/100
                          </span>
                        )}
                      </div>

                      {/* Contact & Industry Details */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sx-mono text-[11px] text-sx-text-subtle">
                        <span>📞 {lead.contact_phone || "No phone"}</span>
                        {isMobile ? (
                          <span className="text-emerald-400">✓ WhatsApp Mobile</span>
                        ) : (
                          <span className="text-amber-500/80">⚠️ Landline/Desk (WhatsApp restricted)</span>
                        )}
                        {meta.industry && <span>🏭 {meta.industry}</span>}
                        {meta.facilityLocation && <span>📍 {meta.facilityLocation}</span>}
                      </div>

                      {/* 17-Dimension Bottleneck & Offer Recommendation */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-sx-xs border border-sx-border bg-sx-surface-1 px-2 py-1 text-sx-text-muted">
                          🔍 <strong className="text-sx-text">Diagnosis:</strong> {meta.primaryBottleneck || meta.painPoint || "General SMB presence optimization"}
                        </span>
                        {meta.recommendedOfferName && (
                          <span className="rounded-sx-xs border border-sx-accent/30 bg-sx-accent-muted px-2 py-1 text-sx-accent">
                            ✨ <strong className="text-sx-text">Recommended:</strong> {meta.recommendedOfferName} ({formatInr(meta.startingPriceInr || meta.estimatedDealValueInr)})
                          </span>
                        )}
                      </div>

                      {/* Error or Tracking notice if any */}
                      {meta.outreachError && (
                        <div className="mt-2 text-[11px] text-red-400">
                          ⚠️ Previous outreach failed: {meta.outreachError}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {lead.status === "CONTACTED" && onOpenConversation ? (
                        <button
                          onClick={() => onOpenConversation(lead.id)}
                          className="rounded-sx-sm border border-sx-accent/40 bg-sx-accent-muted px-2.5 py-1 text-xs font-medium text-sx-accent transition-colors hover:bg-sx-accent hover:text-sx-accent-on"
                        >
                          View Thread →
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSendSingleOutreach(lead)}
                          disabled={isSending || !isMobile}
                          title={!isMobile ? "WhatsApp requires a verified mobile number" : "Dispatch personalized Meta WhatsApp intro template"}
                          className={`rounded-sx-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                            isMobile
                              ? "bg-sx-accent text-sx-accent-on hover:bg-sx-accent-hover"
                              : "cursor-not-allowed border border-sx-border bg-sx-surface-2 text-sx-text-subtle"
                          }`}
                        >
                          {isSending ? "Sending…" : "Send WhatsApp Outreach"}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
