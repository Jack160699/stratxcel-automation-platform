import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Audit Requests — Stratxcel Admin",
  robots: { index: false, follow: false },
};

interface AuditRequestItem {
  id: string;
  business_name: string;
  contact_email: string;
  contact_phone: string | null;
  industry: string | null;
  website_url: string | null;
  goals: string | null;
  source: string;
  status: "new" | "contacted" | "qualified" | "paid" | "audit_in_progress" | "completed" | "converted" | "rejected";
  requested_product: string;
  submitted_at: string;
  contacted_at: string | null;
  internal_notes: string | null;
}

const STATUS_CHIP: Record<AuditRequestItem["status"], { label: string; state: ChipState }> = {
  new: { label: "New", state: "accent" },
  contacted: { label: "Contacted", state: "neutral" },
  qualified: { label: "Qualified", state: "neutral" },
  paid: { label: "Paid", state: "success" },
  audit_in_progress: { label: "In Progress", state: "neutral" },
  completed: { label: "Completed", state: "success" },
  converted: { label: "Converted", state: "success" },
  rejected: { label: "Rejected", state: "danger" },
};

export default async function AdminAuditRequestsPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { data: requests, error } = await ctx.supabase
    .from("public_audit_requests")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(100);

  const list = (requests ?? []) as AuditRequestItem[];
  const newCount = list.filter((r) => r.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Public Audit Requests (₹999)</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          {list.length} request{list.length === 1 ? "" : "s"} · {newCount} new
        </p>
      </header>

      {error && <ErrorState message={`Could not load audit requests: ${error.message}`} />}

      <section className="flex flex-col gap-3">
        {list.length === 0 && !error ? (
          <EmptyState
            title="No audit requests yet."
            subtitle="Public audit submissions from /audit will land here."
          />
        ) : (
          list.map((r) => {
            const chip = STATUS_CHIP[r.status] ?? { label: r.status, state: "neutral" };
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-sx-text">{r.business_name}</span>
                    <a href={`mailto:${r.contact_email}`} className="text-sm text-sx-accent hover:underline">
                      {r.contact_email}
                    </a>
                    {r.contact_phone && <span className="text-xs text-sx-text-muted">{r.contact_phone}</span>}
                    {r.industry && <span className="text-xs text-sx-text-subtle">({r.industry})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                    <span className="font-sx-mono text-[11px] text-sx-text-subtle">
                      {new Date(r.submitted_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                </div>

                {r.website_url && (
                  <p className="mt-2 text-xs text-sx-text-muted">
                    Website:{" "}
                    <a href={r.website_url} target="_blank" rel="noreferrer" className="text-sx-accent underline">
                      {r.website_url}
                    </a>
                  </p>
                )}

                {r.goals && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-sx-text-muted">{r.goals}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sx-border pt-3">
                  <span className="font-sx-mono text-[10px] uppercase tracking-[0.2em] text-sx-text-subtle">
                    Product: {r.requested_product} · Source: {r.source}
                  </span>
                </div>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
