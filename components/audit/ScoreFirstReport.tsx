"use client";

import { useState } from "react";
import { AUDIT_CATEGORY_SCORE_KEYS, type AuditCategoryScoreKey, type AuditCategoryScore } from "@/lib/audit/customer-state";

/**
 * Final Customer Experience Repair mission, Section 1 (Audit Report
 * Redesign): a local business owner must understand their audit in
 * seconds -- Overall Score, then compact collapsed category cards, each
 * opening to a few key findings and the most important action, with a
 * "Read more" for the full detail. This is a PRESENTATION layer only --
 * every number and word here comes from report.categoryScores /
 * report.overallHealth / report.scores, the exact same real data the
 * audit engine already produces (packages/audit-engine/src/live.ts's own
 * structured-output schema already requires categoryScores + findings on
 * every report) but which the existing long-form VisualAuditReport.tsx
 * never rendered at all. Nothing here invents a score, a finding, or an
 * action StratXcel wasn't already told by the real audit.
 */

const CATEGORY_LABELS: Record<AuditCategoryScoreKey, string> = {
  brandPositioning: "Branding",
  websiteConversion: "Website",
  discoverabilitySeo: "Google Presence & SEO",
  socialContent: "Social Media & Content",
  leadGeneration: "Leads",
  trustReputation: "Reviews & Trust",
  customerJourney: "Customer Journey",
  automationOperations: "Automation & Operations",
};

// Fixed display order -- the two categories a local business owner cares
// about first (how findable, how good the website is) lead; the more
// operational ones (automation) trail.
const CATEGORY_ORDER: AuditCategoryScoreKey[] = [
  "discoverabilitySeo",
  "websiteConversion",
  "socialContent",
  "leadGeneration",
  "trustReputation",
  "brandPositioning",
  "customerJourney",
  "automationOperations",
];

function scoreBand(score: number | null): { label: string; barClass: string; textClass: string; badgeClass: string } {
  if (score == null) {
    return { label: "Not enough data yet", barClass: "bg-sx-border-strong", textClass: "text-sx-text-subtle", badgeClass: "bg-sx-surface-2 text-sx-text-subtle" };
  }
  if (score >= 70) return { label: "Strong", barClass: "bg-sx-success", textClass: "text-sx-success", badgeClass: "bg-sx-success/15 text-sx-success" };
  if (score >= 40) return { label: "Needs work", barClass: "bg-sx-warning", textClass: "text-sx-warning", badgeClass: "bg-sx-warning/15 text-sx-warning" };
  return { label: "Weak", barClass: "bg-sx-danger", textClass: "text-sx-danger", badgeClass: "bg-sx-danger/15 text-sx-danger" };
}

/**
 * Splits real explanation text into short, scannable bullets without
 * changing a single word of it -- a presentation transform (sentence
 * boundaries), never a paraphrase or a fabrication. Returns at most
 * `limit` bullets; whatever's left is available for "Read more".
 */
function sentenceBullets(text: string, limit: number): { preview: string[]; rest: string[] } {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { preview: sentences.slice(0, limit), rest: sentences.slice(limit) };
}

function CategoryCard({ categoryKey, data }: { categoryKey: AuditCategoryScoreKey; data: AuditCategoryScore | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const [readMore, setReadMore] = useState(false);
  const score = data?.score ?? null;
  const band = scoreBand(score);
  const explanation = data?.explanation?.trim() || "";
  const { preview, rest } = explanation ? sentenceBullets(explanation, 4) : { preview: [], rest: [] };

  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-sx-surface-2/60 transition-colors"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sx-text">{CATEGORY_LABELS[categoryKey]}</span>
          <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-sx-surface-2 sm:block">
            <div className={`h-full rounded-full ${band.barClass}`} style={{ width: `${score ?? 0}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${band.badgeClass}`}>
            {score != null ? `${score}/100` : "N/A"}
          </span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`shrink-0 text-sx-text-subtle transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-sx-border px-4 py-3.5">
          {preview.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {preview.map((sentence, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-sx-text-muted">
                  <span className={`mt-0.5 shrink-0 ${band.textClass}`}>{score != null && score < 70 ? "⚠" : "✓"}</span>
                  <span>{sentence}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-sx-text-subtle">Not enough verified data yet to break this category down further.</p>
          )}

          {rest.length > 0 && (
            <>
              {readMore && (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {rest.map((sentence, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-sx-text-muted">
                      <span className="mt-0.5 shrink-0 text-sx-text-subtle">·</span>
                      <span>{sentence}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setReadMore((v) => !v)}
                className="mt-2 text-xs font-semibold text-sx-accent hover:underline"
              >
                {readMore ? "Show less ↑" : "Read more →"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ScoreFirstReport({
  overallScore,
  confidence,
  categoryScores,
}: {
  overallScore: number;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | string;
  categoryScores?: Record<AuditCategoryScoreKey, AuditCategoryScore>;
}) {
  const overallBand = scoreBand(overallScore);

  return (
    <div className="flex flex-col gap-4">
      {/* Overall Score -- the one number a non-technical owner needs first */}
      <div className="flex items-center gap-5 rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--sx-surface-2)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              className={overallBand.textClass}
              stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(overallScore / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute font-sx-sans text-xl font-black text-sx-text sm:text-2xl">{overallScore}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Overall Score</p>
          <p className={`text-sm font-bold ${overallBand.textClass}`}>{overallBand.label}</p>
          {confidence && (
            <p className="mt-1 text-[11px] text-sx-text-subtle">
              Based on {confidence.toLowerCase()}-confidence, evidence-backed analysis
            </p>
          )}
        </div>
      </div>

      {/* Compact, collapsed-by-default category cards */}
      {categoryScores ? (
        <div className="flex flex-col gap-2">
          {CATEGORY_ORDER.map((key) => (
            <CategoryCard key={key} categoryKey={key} data={categoryScores[key]} />
          ))}
        </div>
      ) : (
        <p className="rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3.5 text-xs text-sx-text-muted">
          A category-by-category breakdown isn&apos;t available for this report yet.
        </p>
      )}
    </div>
  );
}

export { CATEGORY_LABELS, CATEGORY_ORDER, AUDIT_CATEGORY_SCORE_KEYS };
