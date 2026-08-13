import type { AuditDeliveryReport } from "@/lib/audit/customer-state";
import { AUDIT_CATEGORY_SCORE_KEYS } from "@/lib/audit/customer-state";
import { countEvidenceCoverage, type EvidenceCoverage } from "@/lib/audit/v1/scoring";
import type { VerifiedReviewSummary } from "@/lib/audit/v1/reviews";
import { PlatformIcon, PLATFORM_LABELS, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { PresenceCards } from "@/components/audit/PresenceCards";
import type { PresenceLink } from "@/lib/audit/v1/presence";

const LABELS: Record<string, string> = {
  brandPositioning: "Brand positioning",
  websiteConversion: "Website & conversion",
  discoverabilitySeo: "Discoverability & SEO",
  socialContent: "Social & content",
  leadGeneration: "Lead generation",
  trustReputation: "Trust & reputation",
  customerJourney: "Customer journey",
  automationOperations: "Automation & operations",
};

const COVERAGE_KEYS: Array<{ key: keyof EvidenceCoverage; icon: PlatformIconKey }> = [
  { key: "website", icon: "website" },
  { key: "google", icon: "google_business" },
  { key: "instagram", icon: "instagram" },
  { key: "facebook", icon: "facebook" },
  { key: "reviews", icon: "reviews" },
  { key: "analytics", icon: "analytics" },
];

function coverageStatus(key: keyof EvidenceCoverage, present: boolean, reviews: VerifiedReviewSummary | null): string {
  if (key === "reviews") {
    if (reviews) return "Verified";
    return present ? "Verified" : "Not enough verified data";
  }
  return present ? "Verified" : "Not connected";
}

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          width="14"
          height="14"
          viewBox="0 0 18 18"
          aria-hidden="true"
          className={index < filled ? "text-amber-500" : "text-sx-border-strong"}
          fill="currentColor"
        >
          <path d="M9 2.4l1.7 3.46 3.82.56-2.76 2.7.65 3.8L9 11.12 5.59 12.92l.65-3.8-2.76-2.7 3.82-.56L9 2.4z" />
        </svg>
      ))}
    </span>
  );
}

export function VisualAuditReport({
  report,
  coverage,
  reviews,
  presence,
  onDownload,
  onShare,
  onWhatsApp,
  whatsAppState,
  whatsAppMasked,
  whatsAppSent,
}: {
  report: AuditDeliveryReport;
  coverage?: EvidenceCoverage;
  reviews?: VerifiedReviewSummary | null;
  presence?: PresenceLink[];
  onDownload: () => void;
  onShare: () => void;
  onWhatsApp: () => void;
  whatsAppState?: string;
  whatsAppMasked?: string | null;
  whatsAppSent?: boolean;
}) {
  const evidence = coverage ? countEvidenceCoverage(coverage) : null;
  const score = report.overallHealth?.score ?? report.scores?.overall ?? null;
  const coverageMap = coverage ?? {
    website: Boolean(report.sources?.length),
    google: false,
    instagram: false,
    facebook: false,
    reviews: Boolean(reviews),
    analytics: false,
  };
  const healthUnsupported =
    score == null ||
    (score === 0 && (
      (evidence?.present ?? 0) < 2
      || /insufficient|not enough|ungrounded|sparse|preliminary/i.test(report.overallHealth?.explanation ?? "")
    ));

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-sx-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sx-accent">Growth plan</p>
          <h1 className="mt-1 font-sx-sans text-2xl font-bold text-sx-text">Your Audit is ready</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDownload} className="rounded-sx-sm border border-sx-border-strong px-3 py-2 text-xs font-semibold">Download PDF</button>
          <button type="button" onClick={onShare} className="rounded-sx-sm border border-sx-border-strong px-3 py-2 text-xs font-semibold">Share</button>
          <button type="button" onClick={onWhatsApp} className="inline-flex items-center gap-2 rounded-sx-sm bg-sx-accent px-3 py-2 text-xs font-semibold text-sx-accent-on">
            <PlatformIcon name="whatsapp" />
            {whatsAppSent
              ? "Sent to WhatsApp"
              : whatsAppMasked
                ? `Send to ${whatsAppMasked}`
                : "Send to WhatsApp"}
          </button>
        </div>
      </header>
      {whatsAppState && <p className="text-xs text-sx-text-subtle">{whatsAppSent ? `✓ ${whatsAppState}` : whatsAppState}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <p className="text-xs text-sx-text-subtle">Business health</p>
          <p className="mt-2 font-sx-sans text-3xl font-bold">{healthUnsupported ? "Readiness" : score}</p>
          <p className="mt-2 text-sm text-sx-text-muted">
            {healthUnsupported
              ? "Not enough verified data"
              : report.overallHealth?.explanation ?? "Score shown only where verified evidence exists."}
          </p>
        </div>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 sm:col-span-2">
          <p className="text-xs text-sx-text-subtle">Evidence coverage</p>
          {presence && presence.length > 0 ? (
            <PresenceCards links={presence} />
          ) : (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {COVERAGE_KEYS.map(({ key, icon }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-sx-sm bg-sx-surface-2 px-2 py-1.5">
                <dt className="flex items-center gap-2">
                  <PlatformIcon name={icon} />
                  <span>{PLATFORM_LABELS[icon]}</span>
                </dt>
                <dd className="text-xs text-sx-text-subtle">{coverageStatus(key, coverageMap[key], reviews ?? null)}</dd>
              </div>
            ))}
          </dl>
          )}
          {reviews && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sx-sm border border-sx-border px-3 py-2">
              <PlatformIcon name="reviews" />
              <span className="text-sm font-medium">Reviews</span>
              <StarRating rating={reviews.rating} />
              <span className="text-sm font-semibold">{reviews.rating.toFixed(1)}</span>
              {reviews.count != null && <span className="text-xs text-sx-text-muted">{reviews.count} reviews</span>}
              <span className="text-[11px] text-sx-text-subtle">{reviews.sourceLabel} · Verified</span>
            </div>
          )}
          {evidence && evidence.ratio < 0.34 && (
            <p className="mt-3 text-xs text-sx-warning">This is a preliminary readiness view because verified public coverage is still thin.</p>
          )}
        </div>
      </section>

      {report.categoryScores && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">Category scores</h2>
          <div className="mt-4 space-y-3">
            {AUDIT_CATEGORY_SCORE_KEYS.map((key) => {
              const row = report.categoryScores![key];
              const value = row?.score;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs">
                    <span>{LABELS[key]}</span>
                    <span>{value == null ? "Not enough verified data" : value}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sx-surface-3">
                    <div className="h-full bg-sx-accent" style={{ width: `${value ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
        <h2 className="font-sx-sans text-sm font-semibold">Executive summary</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sx-text-muted">{report.executiveSummary}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="What is working" items={report.strengths} />
        <ListCard title="Growth problems" items={report.growthProblems ?? []} />
        <ListCard title="Priority risks" items={report.priorityRisks} />
        <ListCard title="Quick wins" items={report.quickWins30Days ?? []} />
      </div>

      {report.findings && report.findings.length > 0 && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">Evidence-backed findings</h2>
          <ul className="mt-3 space-y-3">
            {report.findings.map((finding) => (
              <li key={finding.id}>
                <p className="text-sm font-medium text-sx-text">{finding.title}</p>
                <p className="text-sm text-sx-text-muted">{finding.summary}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-sx-text-subtle">{finding.confidence} confidence · {finding.evidenceSourceIds.length} sources</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.opportunities && report.opportunities.length > 0 && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">Opportunities</h2>
          <ul className="mt-3 space-y-3">
            {report.opportunities.map((item) => (
              <li key={item.title}>
                <p className="text-sm font-medium text-sx-text">{item.title}</p>
                <p className="text-sm text-sx-text-muted">{item.rationale}</p>
                <p className="mt-1 text-xs text-sx-text-subtle">{item.nextStep}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.plan && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">30 / 60 / 90 roadmap</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <ListCard title="30 days" items={report.plan.days30} />
            <ListCard title="60 days" items={report.plan.days60} />
            <ListCard title="90 days" items={report.plan.days90} />
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Owner actions" items={report.ownerActions ?? []} />
        <ListCard title="What you can grow yourself" items={report.nextActions ?? report.actionPlan} />
      </div>

      {report.stratxcelSupport && report.stratxcelSupport.length > 0 && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">Where Stratxcel can help</h2>
          <ul className="mt-3 space-y-2 text-sm text-sx-text-muted">
            {report.stratxcelSupport.map((item) => (
              <li key={item.recommendation}><span className="font-medium text-sx-text">{item.capability}:</span> {item.recommendation}</li>
            ))}
          </ul>
        </section>
      )}

      {(report.researchLimitations?.length || report.sources?.length) && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 text-sm text-sx-text-muted">
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Limitations and sources</h2>
          {report.researchLimitations?.map((item) => <p key={item} className="mt-2">{item}</p>)}
          <p className="mt-3 text-xs">{report.sources?.length ?? 0} verified public sources used. Customer-reported facts are not treated as externally verified.</p>
        </section>
      )}
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
      <h2 className="font-sx-sans text-sm font-semibold">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sx-text-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
