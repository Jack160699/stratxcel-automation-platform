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
    let timer: NodeJS.Timeout | null = null;

    async function fetchAudit() {
      try {
        const res = await fetch(`/api/platform/audit?auditId=${auditId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.audit) {
            setAudit(data.audit);
            // If job not yet completed or failed, poll every 2 seconds
            if (data.audit.job_status !== "completed" && data.audit.job_status !== "failed") {
              timer = setTimeout(fetchAudit, 2000);
            }
          }
        } else {
          setError("Could not load audit details.");
        }
      } catch {
        setError("Network error fetching audit report.");
      } finally {
        setLoading(false);
      }
    }

    fetchAudit();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [auditId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
        <p className="mt-4 font-sx-sans text-sm font-semibold text-slate-700">Loading audit job...</p>
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

  const isCompleted = audit.job_status === "completed";
  const report = audit.report_data ?? {};
  const evidence = audit.evidence_data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
            AI Growth Audit Report · ID #{audit.id.slice(0, 8)}
          </span>
          <h1 className="mt-1 font-sx-sans text-2xl sm:text-3xl font-extrabold text-slate-900">
            {audit.business_name}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {audit.industry || "General Industry"} · {audit.website_url || "No website specified"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app/audit" className="rounded-sx-sm border border-slate-300 px-4 py-2 font-sx-sans text-xs font-semibold text-slate-700 hover:bg-slate-50">
            ← All Audits
          </Link>
        </div>
      </div>

      {/* ASYNCHRONOUS PROGRESS VIEW (If not completed) */}
      {!isCompleted ? (
        <div className="mt-8 rounded-sx-lg border border-slate-200 bg-white p-8 shadow-md">
          <div className="text-center">
            <span className="inline-block rounded-full bg-blue-50 px-3.5 py-1 font-sx-mono text-xs font-bold uppercase text-sx-accent">
              Job Status: {audit.job_status.replace(/_/g, " ").toUpperCase()}
            </span>
            <h2 className="mt-4 font-sx-sans text-xl font-bold text-slate-900">
              Analyzing Brand, Positioning & Lead Funnels...
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Most audits complete in under 1 minute. You may leave this page and return anytime.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs font-sx-mono text-slate-500 mb-2">
              <span>Analysis Progress</span>
              <span>{audit.progress_percentage}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full bg-sx-accent transition-all duration-500 ease-out"
                style={{ width: `${audit.progress_percentage}%` }}
              />
            </div>
          </div>

          {/* Educational Cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-sx-md border border-slate-200 bg-slate-50 p-4">
              <span className="font-bold text-slate-900">💡 Brand Brain Alignment</span>
              <p className="mt-1 text-slate-600 leading-relaxed">
                Stratxcel indexes your core offer, tone guidelines, and differentiators to ensure all content stays on-brand.
              </p>
            </div>
            <div className="rounded-sx-md border border-slate-200 bg-slate-50 p-4">
              <span className="font-bold text-slate-900">🔒 Human Approval Model</span>
              <p className="mt-1 text-slate-600 leading-relaxed">
                Sensitive actions like publishing reels or ad spend always wait for your explicit owner sign-off.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* COMPLETED FULL REPORT VIEW */
        <div className="mt-8 space-y-8">
          {/* Executive Summary */}
          <div className="rounded-sx-lg border border-sx-accent/30 bg-blue-50/60 p-6 sm:p-8">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
              Executive Summary
            </span>
            <h2 className="mt-2 font-sx-sans text-xl font-extrabold text-slate-900">
              Audit Findings & Growth Diagnosis
            </h2>
            <p className="mt-3 font-sx-sans text-sm text-slate-700 leading-relaxed">
              {report.executiveSummary}
            </p>
          </div>

          {/* Recommended Stratxcel System Card */}
          {report.productRecommendation && (
            <div className="rounded-sx-lg border border-slate-900 bg-[#0A1020] p-6 sm:p-8 text-white shadow-xl">
              <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-cyan-400">
                Evidence-Based Recommendation
              </span>
              <h3 className="mt-2 font-sx-sans text-2xl font-extrabold text-white">
                Recommended Solution: {report.productRecommendation.recommendedPlan}
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {report.productRecommendation.justification}
              </p>

              <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-slate-800">
                <Link
                  href="/pricing"
                  className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-xs font-bold text-white hover:bg-blue-600"
                >
                  View Plan Details & Pricing →
                </Link>
                <Link
                  href="/contact?intent=consultation"
                  className="rounded-sx-sm border border-slate-700 px-6 py-2.5 font-sx-sans text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Request Human Specialist Consultation
                </Link>
              </div>
            </div>
          )}

          {/* Positioning & Diagnostics */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-sx-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="font-sx-sans text-base font-bold text-slate-900">Brand Positioning Score</h3>
                <span className="rounded-full bg-emerald-100 px-3 py-1 font-sx-mono text-xs font-bold text-emerald-800">
                  Score: {report.businessPositioning?.score || "B+"}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700">Key Strengths:</span>
                  <ul className="mt-1 space-y-1 text-slate-600">
                    {(report.businessPositioning?.strengths ?? []).map((s: string) => (
                      <li key={s}>✓ {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="font-bold text-slate-700">Areas for Improvement:</span>
                  <ul className="mt-1 space-y-1 text-amber-800">
                    {(report.businessPositioning?.improvements ?? []).map((imp: string) => (
                      <li key={imp}>⚠️ {imp}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-sx-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-sx-sans text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
                Website & Funnel Health
              </h3>
              <div className="mt-4 space-y-2.5 text-xs text-slate-700">
                <p><strong>Website:</strong> {report.websiteAnalysis?.url}</p>
                <p><strong>Mobile Responsiveness:</strong> {report.websiteAnalysis?.mobileOptimized ? "✓ Optimized" : "Needs work"}</p>
                <p><strong>Conversion Rating:</strong> {report.websiteAnalysis?.conversionRating}</p>
                <p><strong>CTA Clarity:</strong> {report.websiteAnalysis?.callToActionClarity}</p>
              </div>
            </div>
          </div>

          {/* Implementation Roadmap */}
          <div className="rounded-sx-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <h3 className="font-sx-sans text-xl font-bold text-slate-900 border-b border-slate-200 pb-4">
              30 / 60 / 90-Day Implementation Roadmap
            </h3>

            <div className="mt-6 grid gap-6 md:grid-cols-3 text-xs">
              <div className="rounded-sx-md border border-slate-200 bg-slate-50 p-4">
                <span className="font-sx-mono text-xs font-bold text-sx-accent">30-DAY FOCUS</span>
                <h4 className="mt-1 font-bold text-slate-900">Foundation & Setup</h4>
                <ul className="mt-3 space-y-2 text-slate-600">
                  {(report.roadmap?.days30 ?? []).map((item: string) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-sx-md border border-slate-200 bg-slate-50 p-4">
                <span className="font-sx-mono text-xs font-bold text-amber-600">60-DAY FOCUS</span>
                <h4 className="mt-1 font-bold text-slate-900">Lead Pipeline & Ads</h4>
                <ul className="mt-3 space-y-2 text-slate-600">
                  {(report.roadmap?.days60 ?? []).map((item: string) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-sx-md border border-slate-200 bg-slate-50 p-4">
                <span className="font-sx-mono text-xs font-bold text-emerald-600">90-DAY FOCUS</span>
                <h4 className="mt-1 font-bold text-slate-900">Scale & Optimization</h4>
                <ul className="mt-3 space-y-2 text-slate-600">
                  {(report.roadmap?.days90 ?? []).map((item: string) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Evidence Drawer */}
          <details className="rounded-sx-lg border border-slate-200 bg-slate-50 p-6 text-xs">
            <summary className="cursor-pointer font-sx-sans text-sm font-bold text-slate-900 hover:text-sx-accent">
              View Researched Evidence & Data References ({evidence.length} items) →
            </summary>
            <div className="mt-4 space-y-2">
              {evidence.map((ev: any, idx: number) => (
                <div key={idx} className="rounded border border-slate-200 bg-white p-3 flex items-center justify-between">
                  <div>
                    <span className="font-sx-mono text-[10px] font-bold text-slate-500 uppercase">{ev.type}</span>
                    <p className="mt-0.5 text-slate-800 font-medium">{ev.claim}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-sx-mono text-[10px] font-bold text-slate-700">
                    {ev.confidence} Confidence
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
