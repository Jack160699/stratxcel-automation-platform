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
  progress_percentage: number | null;
  brand_brain_version?: number | null;
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
        <p className="mt-4 font-sx-sans text-sm font-semibold text-sx-text-muted">Loading audit details...</p>
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
  const isLegacySimulated = report.executiveSummary && report.generation_method === "simulated_legacy";

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

      {/* TRUTHFUL SAVED STATE VIEW (No progress bar or fake report) */}
      <div className="mt-8 rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 shadow-md">
        <div className="text-center">
          <span className="inline-block rounded-full bg-sx-accent/20 px-3.5 py-1 font-sx-mono text-xs font-bold uppercase text-sx-accent">
            Information Saved · FOUNDATION_ONLY
          </span>
          <h2 className="mt-4 font-sx-sans text-xl font-bold text-sx-text">
            Automated audit analysis is being prepared.
          </h2>
          <p className="mt-2 text-sm text-sx-text-muted max-w-xl mx-auto leading-relaxed">
            Your business information and growth objectives have been saved. Our team can review them with you during your onboarding call.
          </p>

          {/* Actions: Update Brand Brain & Request Human Review */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/app/brand"
              className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-xs font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
            >
              Update Brand Brain →
            </Link>
            <Link
              href="/contact?intent=consultation"
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-6 py-2.5 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-border"
            >
              Request Human Review
            </Link>
          </div>
        </div>

        {/* Saved Information Summary */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-4">
            <span className="font-bold text-sx-text">📋 Business & Goal Details</span>
            <ul className="mt-2 space-y-1.5 text-sx-text-muted">
              <li><strong>Business:</strong> {audit.business_name}</li>
              <li><strong>Industry:</strong> {audit.industry || "Not specified"}</li>
              <li><strong>Primary Goal:</strong> {audit.goals || "Not specified"}</li>
              <li><strong>Status:</strong> Saved (Engine mode: disabled)</li>
            </ul>
          </div>

          <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-4">
            <span className="font-bold text-sx-text">💡 Brand Brain Context</span>
            <p className="mt-2 text-sx-text-muted leading-relaxed">
              Brand Brain Version #{audit.brand_brain_version ?? 1} linked to this request. Updating your Brand Brain profile ensures your workspace setup stays accurate.
            </p>
          </div>
        </div>

        {/* Legacy Simulated Report Warning if present */}
        {isLegacySimulated && (
          <div className="mt-8 rounded-sx-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
            <span className="font-bold">⚠️ Notice on Historical Reports:</span>
            <p className="mt-1 text-amber-800">
              This record contains a historical draft (generation_method: simulated_legacy, report_trust_status: unverified). Real evidence-based AI research workers are under active implementation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
