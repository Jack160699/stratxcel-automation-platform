import Link from "next/link";
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
  report: AuditDeliveryReport & {
    reportKind?: "AUDIT" | "LAUNCH_PLAN" | "FOUNDATION_PLAN";
    businessStage?: string;
    businessName?: string;
    websiteUrl?: string;
    launchPlan?: any;
  };
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
  const businessName = report.businessName || "Your Business";
  const stage = (report.businessStage || "GROWING").toUpperCase();
  const isLaunchPlan = report.reportKind === "LAUNCH_PLAN" || stage === "IDEA" || stage === "PRE-LAUNCH";
  const isFoundationPlan = report.reportKind === "FOUNDATION_PLAN" || stage === "NEW/STARTING" || stage === "EARLY BUSINESS";

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

  // Determine contextual next actions
  const nextActions = [
    {
      title: "Set up WhatsApp Lead Automation",
      detail: "Capture and qualify customer inquiries 24/7 with zero delay.",
      href: "/app/integrations",
      badge: "WhatsApp Receptionist",
    },
    {
      title: "Activate Social Autopilot",
      detail: "Publish brand-aligned content and maintain audience consistency.",
      href: "/app/social/copilot",
      badge: "Social Media",
    },
    {
      title: "Centralize CRM Pipeline",
      detail: "Never lose track of high-intent customer inquiries.",
      href: "/app/crm",
      badge: "CRM",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* 1. Header & Quick Actions */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-sx-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
              Stage: {stage}
            </span>
            <span className="text-xs text-sx-text-subtle">
              {isLaunchPlan ? "Launch Strategy" : isFoundationPlan ? "Foundation Plan" : "Growth Audit"}
            </span>
          </div>
          <h1 className="mt-1.5 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            {isLaunchPlan
              ? `${businessName} — Business Launch & Growth Plan`
              : `${businessName} — Business Growth Analysis`}
          </h1>
          <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
            Evidence-backed strategic roadmap based on real public signals, channels, and market gaps.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDownload} className="rounded-sx-sm border border-sx-border-strong px-3 py-2 text-xs font-semibold hover:bg-sx-surface-2">Download PDF</button>
          <button type="button" onClick={onShare} className="rounded-sx-sm border border-sx-border-strong px-3 py-2 text-xs font-semibold hover:bg-sx-surface-2">Share</button>
          <button type="button" onClick={onWhatsApp} className="inline-flex items-center gap-2 rounded-sx-sm bg-sx-accent px-3.5 py-2 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]">
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

      {/* 2. WHERE YOUR BUSINESS IS TODAY & WHAT WE FOUND */}
      <section className="rounded-[1.25rem] border border-sx-border bg-gradient-to-br from-sx-surface-1 via-sx-surface-1 to-sx-surface-2 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sx-accent">Where Your Business Stands</p>
        </div>
        <h2 className="mt-1 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
          What Stratxcel Discovered About {businessName}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-3.5 space-y-1">
            <span className="font-bold text-sx-text block">Identity & Domain</span>
            <p className="text-sx-text-muted">{businessName}</p>
            <p className="font-mono text-[11px] text-sx-text-subtle">{report.websiteUrl || "Domain connected"}</p>
          </div>

          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-3.5 space-y-1">
            <span className="font-bold text-sx-text block">Detected Operational Stage</span>
            <p className="text-emerald-400 font-semibold">{stage}</p>
            <p className="text-sx-text-subtle">Prioritized for high-leverage growth</p>
          </div>

          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-3.5 space-y-1">
            <span className="font-bold text-sx-text block">Evidence Coverage</span>
            <p className="text-sx-text-muted">{report.sources?.length ?? 1} verified source(s)</p>
            <p className="text-sx-text-subtle">Grounding level: {evidence?.ratio ? `${Math.round(evidence.ratio * 100)}%` : "Verified"}</p>
          </div>
        </div>

        {/* Strengths & Critical Gaps Summary */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 text-xs pt-3 border-t border-sx-border/60">
          <div>
            <span className="font-bold text-emerald-400 block mb-1.5">✓ Discovered Strengths:</span>
            <ul className="space-y-1 text-sx-text-muted">
              {report.strengths.slice(0, 3).map((str, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400">✓</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="font-bold text-amber-400 block mb-1.5">⚠ High-Priority Gaps:</span>
            <ul className="space-y-1 text-sx-text-muted">
              {report.priorityRisks.slice(0, 3).map((risk, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-400">⚠</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Launch Plan Dedicated Roadmap (if Idea/Pre-Launch) */}
      {isLaunchPlan && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-accent/20 px-2.5 py-0.5 text-xs font-semibold text-sx-accent">
              Pre-Launch Strategy
            </span>
          </div>
          <h2 className="mt-3 font-sx-sans text-lg font-semibold text-sx-text">
            Foundation Roadmap: 6-Step Build Sequence
          </h2>
          <p className="mt-1 text-sm text-sx-text-muted">
            Because {businessName} is establishing its foundation, follow this proven sequential rollout:
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-sx-sm bg-sx-surface-1 p-3.5 border border-sx-border">
              <span className="font-bold text-sx-text block mb-2">1. FOUNDATION ASSETS TO BUILD</span>
              <ul className="space-y-1.5 text-sx-text-muted list-disc pl-4">
                <li>Live high-converting website & domain</li>
                <li>Branded multi-channel social presence</li>
                <li>WhatsApp business automated receptionist</li>
                <li>Centralized customer & inquiry CRM</li>
                <li>Initial targeted customer acquisition</li>
              </ul>
            </div>

            <div className="rounded-sx-sm bg-sx-surface-1 p-3.5 border border-sx-accent/40">
              <span className="font-bold text-sx-accent block mb-2">2. RECOMMENDED 30-DAY SEQUENCE</span>
              <ol className="space-y-1 text-sx-text list-decimal pl-4 font-medium">
                <li>Deploy canonical Website & Landing Page</li>
                <li>Connect Official Social Channels</li>
                <li>Encode Brand Brain voice & offerings</li>
                <li>Enable WhatsApp Instant Receptionist</li>
                <li>Centralize CRM Lead Pipeline</li>
                <li>Launch Initial Lead Generation</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* 4. Health Scores & Evidence Coverage */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <p className="text-xs text-sx-text-subtle">Overall Digital Health</p>
          <p className="mt-2 font-sx-sans text-3xl font-bold">{healthUnsupported ? "Readiness" : score}</p>
          <p className="mt-2 text-sm text-sx-text-muted">
            {healthUnsupported
              ? "Score shown where complete public evidence exists."
              : report.overallHealth?.explanation ?? "Grounding score derived from verified evidence."}
          </p>
        </div>
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 sm:col-span-2">
          <p className="text-xs text-sx-text-subtle">Verified Channel Coverage</p>
          {presence && presence.length > 0 ? (
            <PresenceCards links={presence} />
          ) : (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </section>

      {/* 5. Category Scores */}
      {report.categoryScores && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">Category Breakdown for {businessName}</h2>
          <div className="mt-4 space-y-3">
            {AUDIT_CATEGORY_SCORE_KEYS.map((key) => {
              const row = report.categoryScores![key];
              const value = row?.score;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs">
                    <span>{LABELS[key]}</span>
                    <span>{value == null ? "Not enough verified data" : `${value}/100`}</span>
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

      {/* 6. Executive Summary */}
      <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
        <h2 className="font-sx-sans text-sm font-semibold">Executive Strategy Summary</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sx-text-muted">{report.executiveSummary}</p>
      </section>

      {/* 7. Findings & Opportunities */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ListCard title="What is Working" items={report.strengths} />
        <ListCard title="Growth Bottlenecks" items={report.growthProblems ?? []} />
        <ListCard title="Priority Risks" items={report.priorityRisks} />
        <ListCard title="30-Day Quick Wins" items={report.quickWins30Days ?? []} />
      </div>

      {/* 8. 30/60/90 Roadmap */}
      {report.plan && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-sm font-semibold">30 / 60 / 90 Day Transformation Plan</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <ListCard title="30 Days (Quick Wins)" items={report.plan.days30} />
            <ListCard title="60 Days (Systems)" items={report.plan.days60} />
            <ListCard title="90 Days (Scale)" items={report.plan.days90} />
          </div>
        </section>
      )}

      {/* 9. YOUR NEXT BEST MOVE (Contextual Mapping to Capabilities) */}
      <section className="rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-6">
        <h2 className="font-sx-sans text-xl font-bold text-sx-text">Your Next Best Moves</h2>
        <p className="mt-1 text-xs text-sx-text-muted">
          Recommended high-impact actions prioritized specifically for {businessName}:
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {nextActions.map((act) => (
            <div key={act.title} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-4 flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-full bg-sx-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">
                  {act.badge}
                </span>
                <p className="font-semibold text-sm text-sx-text">{act.title}</p>
                <p className="mt-1 text-xs text-sx-text-muted">{act.detail}</p>
              </div>
              <Link href={act.href} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-sx-accent hover:underline">
                Activate Now →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* 10. RECOMMENDED STRATXCEL PACKAGE & 30-DAY TRANSFORMATION */}
      <section className="rounded-[1.25rem] border border-sx-accent/40 bg-gradient-to-br from-sx-accent/10 via-sx-surface-1 to-sx-surface-1 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sx-accent/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-sx-accent">
              Recommended for {businessName}
            </span>
            <h3 className="font-sx-sans text-2xl font-bold text-sx-text">
              {isLaunchPlan ? "Starter — Digital Foundation & Launch" : "Growth — Active Lead Generation & Automation"}
            </h3>
            <p className="text-xs text-sx-text-muted sm:text-sm">
              {isLaunchPlan
                ? "Designed to take your business from idea/pre-launch to live customer acquisition with professional website, branding, and WhatsApp receptionist."
                : "Designed to scale your customer volume with automated daily content, 24/7 WhatsApp response, centralized CRM, and AI lead qualification."}
            </p>

            <div className="pt-2">
              <span className="text-xs font-bold text-sx-text block mb-1">What is included:</span>
              <ul className="grid gap-1.5 sm:grid-cols-2 text-xs text-sx-text-muted">
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> WhatsApp Automated Receptionist</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Social Autopilot Publishing</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Centralized CRM & Pipeline</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Continuous Brand Brain Learning</li>
              </ul>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start lg:items-end gap-2">
            <Link
              href="/app/billing"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
            >
              {isLaunchPlan ? "Explore Starter Plan →" : "Activate Growth Plan →"}
            </Link>
            <span className="text-[11px] text-sx-text-subtle">No long-term contracts · Cancel anytime</span>
          </div>
        </div>
      </section>
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
