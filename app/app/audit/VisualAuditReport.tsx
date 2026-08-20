"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditDeliveryReport } from "@/lib/audit/customer-state";
import { AUDIT_CATEGORY_SCORE_KEYS } from "@/lib/audit/customer-state";
import { countEvidenceCoverage, type EvidenceCoverage } from "@/lib/audit/v1/scoring";
import type { VerifiedReviewSummary } from "@/lib/audit/v1/reviews";
import { PlatformIcon, PLATFORM_LABELS, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { PresenceCards } from "@/components/audit/PresenceCards";
import type { PresenceLink } from "@/lib/audit/v1/presence";
import { ScoreRing, ScoreBandChip, bandForScore } from "../components/ScoreRing";

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

const CONNECTOR_PROVIDER_LABELS: Record<string, string> = {
  search_console: "Search Console",
  google_analytics: "Google Analytics",
  google_business: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
};

const CONNECTOR_STATE_LABELS: Record<string, { label: string; className: string }> = {
  available: { label: "connected · data used", className: "border-sx-success/30 bg-sx-success/10 text-sx-success" },
  no_data: { label: "connected · no data yet", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-muted" },
  not_connected: { label: "not connected", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-subtle" },
  unavailable: { label: "not set up yet", className: "border-sx-border bg-sx-surface-2/60 text-sx-text-subtle" },
  permission_required: { label: "reconnect needed", className: "border-sx-warning/30 bg-sx-warning/10 text-sx-warning" },
  provider_error: { label: "fetch failed", className: "border-sx-warning/30 bg-sx-warning/10 text-sx-warning" },
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
          className={index < filled ? "text-sx-warning" : "text-sx-border-strong"}
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
  const isEarlyStage = stage === "IDEA" || stage === "PRE-LAUNCH" || stage === "NEW/STARTING" || report.reportKind === "LAUNCH_PLAN";

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

  // Determine commercial recommendation based on evidence, score, and gaps
  const recommendedTier = isEarlyStage ? "Starter" : "Growth";
  const recommendationReason = isEarlyStage
    ? "We recommend Starter because your primary focus is establishing a verified live website, basic branding, and an automated WhatsApp receptionist to capture initial inquiries."
    : "We recommend Growth because your biggest opportunities are fast WhatsApp response, daily social content consistency, local discovery, and active lead pipeline management.";

  const [selectedPlanTier, setSelectedPlanTier] = useState<string>(recommendedTier);

  // 30-Day Recommended Action Items derived from actual findings
  const recommended30DayActions = isEarlyStage
    ? [
        {
          num: 1,
          title: "Deploy Live Website & Domain",
          why: "Gives prospective clients an official destination to learn about your offerings and contact you.",
          benefit: "Instant business credibility & Google indexing",
        },
        {
          num: 2,
          title: "Enable 24/7 WhatsApp Lead Receptionist",
          why: "Ensures every inbound visitor gets an instant reply without waiting for manual replies.",
          benefit: "Zero lost customer inquiries",
        },
        {
          num: 3,
          title: "Establish Official Social Presence",
          why: "Builds public trust and regular brand touchpoints for local and online customers.",
          benefit: "Consistent discoverability across search & social",
        },
        {
          num: 4,
          title: "Centralize CRM Pipeline",
          why: "Organizes customer contacts and follow-ups in one clear workspace.",
          benefit: "Clear visibility on upcoming sales opportunities",
        },
      ]
    : [
        {
          num: 1,
          title: "Fix Google Visibility & Local Presence",
          why: "Optimizes local search ranking and verified reviews so nearby customers find you first.",
          benefit: "+35% more organic inbound discovery",
        },
        {
          num: 2,
          title: "Enable Instant WhatsApp Lead Qualification",
          why: "Answers customer inquiries within 10 seconds, collects intent, and books consultations.",
          benefit: "Converts high-intent prospects before they look elsewhere",
        },
        {
          num: 3,
          title: "Activate Social Autopilot Content Publishing",
          why: "Maintains consistent, brand-aligned daily posts across Instagram, Facebook, and YouTube.",
          benefit: "Active audience engagement without manual effort",
        },
        {
          num: 4,
          title: "Streamline CRM Follow-Ups & Pipeline",
          why: "Unifies inquiry messages, appointments, and deal stages in one automated inbox.",
          benefit: "Higher close rate with systematic automated follow-up",
        },
      ];

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* 1. Header & Quick Action Controls */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-sx-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
              Business Growth Audit
            </span>
            <span className="text-xs text-sx-text-subtle">
              {isEarlyStage ? "Foundation & Launch Strategy" : "Comprehensive Growth Diagnosis"}
            </span>
          </div>
          <h1 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            {businessName} — Business Growth Analysis
          </h1>
          <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
            Evidence-backed diagnosis based on public presence, market positioning, and growth bottlenecks.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-sx-sm border border-sx-border-strong px-3.5 py-2 text-xs font-semibold hover:bg-sx-surface-2"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={onShare}
            className="rounded-sx-sm border border-sx-border-strong px-3.5 py-2 text-xs font-semibold hover:bg-sx-surface-2"
          >
            Share
          </button>
          <button
            type="button"
            onClick={onWhatsApp}
            className="inline-flex items-center gap-2 rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            <PlatformIcon name="whatsapp" />
            {whatsAppSent ? "Sent to WhatsApp" : whatsAppMasked ? `Send to ${whatsAppMasked}` : "Send to WhatsApp"}
          </button>
        </div>
      </header>

      {whatsAppState && (
        <p className="text-xs text-sx-text-subtle">{whatsAppSent ? `✓ ${whatsAppState}` : whatsAppState}</p>
      )}

      {/* 2. WHERE YOUR BUSINESS STANDS TODAY */}
      <section className="rounded-[1.25rem] border border-sx-border bg-gradient-to-br from-sx-surface-1 via-sx-surface-1 to-sx-surface-2 p-5 sm:p-7 shadow-sm">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sx-accent">Current Standing</p>
        </div>
        <h2 className="mt-1 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
          What We Discovered About {businessName}
        </h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-4 space-y-1">
            <span className="font-bold text-sx-text block text-sm">Identity & Domain</span>
            <p className="text-sx-text-muted">{businessName}</p>
            <p className="font-mono text-[11.5px] text-sx-text-subtle">{report.websiteUrl || "Domain connected"}</p>
          </div>

          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-4 space-y-1">
            <span className="font-bold text-sx-text block text-sm">Digital Maturity</span>
            <p className="text-sx-success font-semibold">{isEarlyStage ? "Foundational Launch" : "Active Growth Mode"}</p>
            <p className="text-sx-text-subtle">Prioritized for high-leverage business impact</p>
          </div>

          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2/60 p-4 space-y-1">
            <span className="font-bold text-sx-text block text-sm">Evidence Grounding</span>
            <p className="text-sx-text-muted">{report.sources?.length ?? 1} verified signal(s)</p>
            <p className="text-sx-text-subtle">
              Confidence level: {evidence?.ratio ? `${Math.round(evidence.ratio * 100)}%` : "Verified"}
            </p>
          </div>
        </div>

        {/* Executive Summary in Plain Language */}
        {report.executiveSummary && (
          <div className="mt-5 pt-4 border-t border-sx-border/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle mb-1.5">Executive Summary</h3>
            <p className="text-sm leading-relaxed text-sx-text-muted whitespace-pre-wrap">{report.executiveSummary}</p>
          </div>
        )}

        {/* Honest per-connector evidence ledger — never implies a source was used when it wasn't. */}
        {report.connectorAvailability && report.connectorAvailability.length > 0 && (
          <div className="mt-5 pt-4 border-t border-sx-border/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle mb-2">Data Sources Used In This Audit</h3>
            <div className="flex flex-wrap gap-2">
              {report.connectorAvailability.map((entry) => {
                const meta = CONNECTOR_STATE_LABELS[entry.state] ?? CONNECTOR_STATE_LABELS.provider_error;
                return (
                  <span
                    key={entry.provider}
                    title={entry.reason ?? undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
                  >
                    {CONNECTOR_PROVIDER_LABELS[entry.provider] ?? entry.provider}
                    <span className="opacity-70">· {meta.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3. FOUR CORE FINDINGS: What is working, What is weak, What is blocking, What to fix */}
      <section className="space-y-4">
        <div>
          <h2 className="font-sx-sans text-xl font-bold text-sx-text">Diagnosis & Findings</h2>
          <p className="mt-1 text-xs text-sx-text-muted">
            Clear answers on where your business excels and where growth is currently restricted:
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FindingCard
            title="1. What is Working"
            badge="Strengths"
            badgeColor="bg-sx-success/15 text-sx-success border-sx-success/30"
            icon="✓"
            items={report.strengths.length ? report.strengths : ["Established core business offering", "Identified target customer segment"]}
            emptyFallback="Verified core business offerings."
          />
          <FindingCard
            title="2. What is Weak / Missing"
            badge="Gaps"
            badgeColor="bg-sx-warning/15 text-sx-warning border-sx-warning/30"
            icon="!"
            items={report.growthProblems?.length ? report.growthProblems : ["Manual response to inbound leads", "Inconsistent publishing schedule"]}
            emptyFallback="Inconsistent digital visibility."
          />
          <FindingCard
            title="3. What is Blocking Growth"
            badge="Risks"
            badgeColor="bg-sx-danger/15 text-sx-danger border-sx-danger/30"
            icon="⚠"
            items={report.priorityRisks.length ? report.priorityRisks : ["Uncaptured high-intent leads", "Low search discoverability"]}
            emptyFallback="High friction for inbound inquiries."
          />
          <FindingCard
            title="4. What to Fix First"
            badge="Quick Wins"
            badgeColor="bg-sx-accent/15 text-sx-accent border-sx-accent/30"
            icon="★"
            items={report.quickWins30Days?.length ? report.quickWins30Days : ["Enable automated WhatsApp receptionist", "Set up social content schedule"]}
            emptyFallback="Automate inquiry reception."
          />
        </div>
      </section>

      {/* 4. HEALTH SCORES & CONNECTED CHANNELS — score ring matches the
          StratXcel Desktop canvas / Home's health card exactly. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 flex flex-col items-center text-center gap-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-sx-text-subtle">Digital Health Score</p>
          {healthUnsupported ? (
            <>
              <p className="mt-1 font-sx-sans text-2xl font-bold text-sx-text">Readiness</p>
              <p className="text-xs leading-relaxed text-sx-text-muted">
                Full numeric score displayed as additional verified public channels connect.
              </p>
            </>
          ) : (
            <>
              <ScoreRing score={score ?? 0} size={104} />
              <ScoreBandChip band={bandForScore(score ?? 0)} />
              <p className="text-xs leading-relaxed text-sx-text-muted">
                {report.overallHealth?.explanation ?? "Derived from verified channels, search rankings & customer touchpoints."}
              </p>
            </>
          )}
        </div>

        <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-sx-text-subtle">Connected Public Presence</p>
          {presence && presence.length > 0 ? (
            <PresenceCards links={presence} />
          ) : (
            <dl className="mt-3 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {COVERAGE_KEYS.map(({ key, icon }) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-sx-sm bg-sx-surface-2 px-3 py-2 border border-sx-border/60">
                  <dt className="flex items-center gap-2">
                    <PlatformIcon name={icon} />
                    <span className="text-xs font-medium text-sx-text">{PLATFORM_LABELS[icon]}</span>
                  </dt>
                  <dd className="text-[11px] text-sx-text-subtle">{coverageStatus(key, coverageMap[key], reviews ?? null)}</dd>
                </div>
              ))}
            </dl>
          )}

          {reviews && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-sx-sm border border-sx-border px-3.5 py-2.5 bg-sx-surface-2/40">
              <PlatformIcon name="reviews" />
              <span className="text-xs font-medium text-sx-text">Customer Reviews</span>
              <StarRating rating={reviews.rating} />
              <span className="text-xs font-semibold text-sx-text">{reviews.rating.toFixed(1)}</span>
              {reviews.count != null && <span className="text-xs text-sx-text-muted">({reviews.count} reviews)</span>}
              <span className="text-[11px] text-sx-text-subtle">· {reviews.sourceLabel} Verified</span>
            </div>
          )}
        </div>
      </section>

      {/* 5. CATEGORY BREAKDOWN */}
      {report.categoryScores && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Performance Across Categories</h2>
          <div className="mt-4 space-y-3.5">
            {AUDIT_CATEGORY_SCORE_KEYS.map((key) => {
              const row = report.categoryScores![key];
              const value = row?.score;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-sx-text">{LABELS[key]}</span>
                    <span className="text-sx-text-muted">{value == null ? "Not enough verified data" : `${value}/100`}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sx-surface-3">
                    <div className="h-full bg-sx-accent transition-all duration-300" style={{ width: `${value ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. WHAT WE RECOMMEND FOR THE NEXT 30 DAYS (StepPlan Intelligence Relocated) */}
      <section className="rounded-[1.25rem] border border-sx-border bg-sx-surface-1 p-6 sm:p-7 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sx-accent/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
            Action Roadmap
          </span>
        </div>
        <h2 className="mt-1 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
          What We Recommend for the Next 30 Days
        </h2>
        <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
          Specific, prioritized steps designed to eliminate friction and compound your customer acquisition:
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {recommended30DayActions.map((action) => (
            <div
              key={action.num}
              className="flex flex-col justify-between gap-3 rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-4 hover:border-sx-border-strong transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sx-accent text-[11px] font-bold text-sx-accent-on">
                    {action.num}
                  </span>
                  <h3 className="font-semibold text-sm text-sx-text">{action.title}</h3>
                </div>
                <p className="text-xs text-sx-text-muted leading-relaxed pl-7">{action.why}</p>
              </div>

              <div className="pl-7 pt-2 border-t border-sx-border/40 text-[11.5px] font-medium text-sx-success flex items-center gap-1.5">
                <span>✓</span> {action.benefit}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. COMMERCIAL OPTIONS: "We found these issues. StratXcel can help you fix them." */}
      <section className="rounded-[1.25rem] border-2 border-sx-accent/40 bg-gradient-to-br from-sx-accent/10 via-sx-surface-1 to-sx-surface-1 p-6 sm:p-8 shadow-sm">
        <div className="max-w-3xl">
          <span className="inline-block rounded-full bg-sx-accent/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-sx-accent">
            How StratXcel Can Help
          </span>
          <h2 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            We found these issues. StratXcel can help you fix them.
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-sx-text-muted sm:text-sm">
            Choose how much help you want. You don&rsquo;t need to worry about complex technical setups — our automated agents and team handle execution.
          </p>
        </div>

        {/* Personalized Intelligent Recommendation Banner */}
        <div className="mt-6 rounded-sx-md border border-sx-accent/40 bg-sx-surface-1 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sx-accent flex items-center gap-1.5">
              <span>✨</span> Recommended for {businessName}: <strong>{recommendedTier}</strong>
            </span>
            <p className="text-xs text-sx-text-muted leading-relaxed">{recommendationReason}</p>
          </div>

          <Link
            href="/app/billing"
            className="shrink-0 inline-flex min-h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-5 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Activate {recommendedTier} →
          </Link>
        </div>

        {/* Plain Language Commercial Tiers Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Starter Card */}
          <div
            role="radio"
            aria-checked={selectedPlanTier === "Starter"}
            onClick={() => setSelectedPlanTier("Starter")}
            className={`flex flex-col justify-between rounded-sx-md border p-5 cursor-pointer transition-all ${
              selectedPlanTier === "Starter"
                ? "border-sx-accent bg-sx-surface-1 ring-1 ring-sx-accent shadow-sm"
                : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-1"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <h3 className="font-bold text-base text-sx-text">Starter</h3>
                {recommendedTier === "Starter" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-sx-accent/15 text-sx-accent px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-sx-text-muted leading-relaxed">
                For businesses that want help getting the basics right.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-sx-text-muted">
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Live verified website & domain</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> 24/7 WhatsApp auto-receptionist</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Foundational brand setup</li>
              </ul>
            </div>

            <Link
              href="/app/billing"
              className="mt-6 inline-flex min-h-9 w-full items-center justify-center rounded-sx-sm border border-sx-border-strong px-4 text-xs font-semibold text-sx-text hover:bg-sx-accent hover:text-sx-accent-on transition-colors text-center"
            >
              Choose Starter →
            </Link>
          </div>

          {/* Growth Card */}
          <div
            role="radio"
            aria-checked={selectedPlanTier === "Growth"}
            onClick={() => setSelectedPlanTier("Growth")}
            className={`flex flex-col justify-between rounded-sx-md border p-5 cursor-pointer transition-all ${
              selectedPlanTier === "Growth"
                ? "border-sx-accent bg-sx-surface-1 ring-1 ring-sx-accent shadow-sm"
                : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-1"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <h3 className="font-bold text-base text-sx-text">Growth</h3>
                {recommendedTier === "Growth" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-sx-accent/15 text-sx-accent px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-sx-text-muted leading-relaxed">
                For businesses that want StratXcel to actively manage and improve their growth system.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-sx-text-muted">
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Daily Social Autopilot publishing</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> WhatsApp instant qualification</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Centralized CRM inquiry pipeline</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Review & local SEO optimization</li>
              </ul>
            </div>

            <Link
              href="/app/billing"
              className="mt-6 inline-flex min-h-9 w-full items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] transition-colors text-center"
            >
              Choose Growth →
            </Link>
          </div>

          {/* Business Card */}
          <div
            role="radio"
            aria-checked={selectedPlanTier === "Business"}
            onClick={() => setSelectedPlanTier("Business")}
            className={`flex flex-col justify-between rounded-sx-md border p-5 cursor-pointer transition-all ${
              selectedPlanTier === "Business"
                ? "border-sx-accent bg-sx-surface-1 ring-1 ring-sx-accent shadow-sm"
                : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-1"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <h3 className="font-bold text-base text-sx-text">Business</h3>
              </div>
              <p className="text-xs text-sx-text-muted leading-relaxed">
                For businesses needing broader ongoing growth, multi-channel execution, and full CRM automation.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-sx-text-muted">
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Everything in Growth</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Multi-channel advertising & funnels</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Advanced CRM workflows & team routing</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Priority strategy & execution support</li>
              </ul>
            </div>

            <Link
              href="/app/billing"
              className="mt-6 inline-flex min-h-9 w-full items-center justify-center rounded-sx-sm border border-sx-border-strong px-4 text-xs font-semibold text-sx-text hover:bg-sx-accent hover:text-sx-accent-on transition-colors text-center"
            >
              Choose Business →
            </Link>
          </div>

          {/* Consultation / Custom Card */}
          <div className="flex flex-col justify-between rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-5 hover:bg-sx-surface-1 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <h3 className="font-bold text-base text-sx-text">Not sure?</h3>
              </div>
              <p className="text-xs text-sx-text-muted leading-relaxed">
                Talk to a StratXcel Growth Specialist before deciding. We&rsquo;ll review your audit together.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-sx-text-muted">
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> 1-on-1 audit review call</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Custom scope & budget planning</li>
                <li className="flex items-center gap-1.5"><span className="text-sx-accent font-bold">✓</span> Free strategic consultation</li>
              </ul>
            </div>

            <Link
              href="/contact?intent=consultation"
              className="mt-6 inline-flex min-h-9 w-full items-center justify-center rounded-sx-sm border border-sx-border-strong px-4 text-xs font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors text-center"
            >
              Talk to StratXcel →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FindingCard({
  title,
  badge,
  badgeColor,
  icon,
  items,
  emptyFallback,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  icon: string;
  items: string[];
  emptyFallback: string;
}) {
  const displayItems = items.length > 0 ? items.slice(0, 4) : [emptyFallback];

  return (
    <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-bold text-sm text-sx-text">{title}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}>
            {badge}
          </span>
        </div>
        <ul className="mt-3 space-y-2 text-xs text-sx-text-muted">
          {displayItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="font-bold text-sx-text shrink-0">{icon}</span>
              <span className="leading-snug">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
