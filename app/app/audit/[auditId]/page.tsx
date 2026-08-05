"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface AuditRecord {
  id: string;
  business_name: string;
  industry: string | null;
  website_url: string | null;
  goals: string | null;
  job_status: string;
  progress_percentage: number;
  report_data: any;
  evidence_data: any[];
  submitted_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export default function AuditReportProgressPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch(`/api/platform/audit?auditId=${auditId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.audit) {
            setAudit(data.audit);
          } else {
            setError("Audit record not found or access denied.");
          }
        } else {
          setError("Could not load audit details.");
        }
      } catch {
        setError("Network error fetching audit details.");
      } finally {
        setLoading(false);
      }
    }

    fetchAudit();
  }, [auditId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
        <p className="mt-4 font-sx-sans text-sm font-semibold text-sx-text-muted">Loading audit request...</p>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-sx-md border border-red-300 bg-red-50 p-6 text-red-800 text-sm">
          {error || "Audit record not found."}
        </div>
        <Link href="/app/audit" className="mt-4 inline-block font-sx-sans text-xs text-sx-accent underline">
          ← Return to Audit Dashboard
        </Link>
      </div>
    );
  }

  const report = audit.report_data ?? {};
  const isLegacySimulated = report.executiveSummary && !report.notice;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sx-border pb-6">
        <div>
          <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
            Business Audit — Early Access (FOUNDATION_ONLY)
          </span>
          <h1 className="mt-1 font-sx-sans text-2xl sm:text-3xl font-extrabold text-sx-text">
            {audit.business_name}
          </h1>
          <p className="mt-0.5 text-xs text-sx-text-subtle">
            {audit.industry || "General Industry"} · {audit.website_url || "No website specified"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app/audit" className="rounded-sx-sm border border-sx-border-strong px-4 py-2 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
            ← All Audits
          </Link>
        </div>
      </div>

      {/* TRUTHFUL HONEST RESTRICTED STATE (FOUNDATION_ONLY) */}
      <div className="mt-8 rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 shadow-md">
        <div className="text-center">
          <span className="inline-block rounded-full bg-sx-accent/20 px-3.5 py-1 font-sx-mono text-xs font-bold uppercase text-sx-accent">
            Request Saved · Early Access
          </span>
          <h2 className="mt-4 font-sx-sans text-xl font-bold text-sx-text">
            Automated audit analysis is being prepared.
          </h2>
          <p className="mt-2 text-sm text-sx-text-muted max-w-xl mx-auto leading-relaxed">
            Your business information has been saved, and the Stratxcel team can review it with you during onboarding.
          </p>
        </div>

        {/* Informational Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-4">
            <span className="font-bold text-sx-text">💡 Brand Brain Profile</span>
            <p className="mt-1 text-sx-text-muted leading-relaxed">
              Your core offers, audience profile, and positioning parameters are saved in your workspace Brand Brain.
            </p>
          </div>
          <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-4">
            <span className="font-bold text-sx-text">🤝 Human Specialist Review</span>
            <p className="mt-1 text-sx-text-muted leading-relaxed">
              Our operations team reviews your requested growth goals to recommend the optimal Stratxcel package.
            </p>
          </div>
        </div>

        {/* Legacy Simulated Report Warning if present */}
        {isLegacySimulated && (
          <div className="mt-8 rounded-sx-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
            <span className="font-bold">⚠️ Notice on Historical Reports:</span>
            <p className="mt-1 text-amber-800">
              This record contains a historical simulated report draft (generation_method: simulated_legacy). Real evidence-based AI research workers are under active implementation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
