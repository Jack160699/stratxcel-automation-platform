"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { IntakeWizard, type IntakeOrder } from "./IntakeWizard";
import { trackFunnel } from "@/lib/analytics/events";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import {
  AUDIT_CATEGORY_SCORE_KEYS,
  deriveAuditCustomerState,
  normalizeAuditDeliveryReport,
  type AuditCategoryScoreKey,
} from "@/lib/audit/customer-state";

const CATEGORY_LABELS: Record<AuditCategoryScoreKey, string> = {
  brandPositioning: "Brand positioning",
  websiteConversion: "Website & conversion",
  discoverabilitySeo: "Discoverability & SEO",
  socialContent: "Social & content",
  leadGeneration: "Lead generation",
  trustReputation: "Trust & reputation",
  customerJourney: "Customer journey",
  automationOperations: "Automation & operations",
};

function SectionFrame({
  means,
  matters,
  todo,
  children,
}: {
  means?: string;
  matters?: string;
  todo?: string;
  children?: ReactNode;
}) {
  if (!means && !matters && !todo && !children) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-sx-border pt-3 text-xs leading-5 text-sx-text-subtle">
      {means && (
        <p><span className="font-medium text-sx-text">What this means:</span> {means}</p>
      )}
      {matters && (
        <p><span className="font-medium text-sx-text">Why this matters:</span> {matters}</p>
      )}
      {todo && (
        <p><span className="font-medium text-sx-text">What to do:</span> {todo}</p>
      )}
      {children}
    </div>
  );
}

interface AuditOrder extends IntakeOrder {
  id: string;
  status: "pending_payment" | "paid" | "in_review" | "completed" | "refunded" | "cancelled";
  report_data: Record<string, unknown> | null;
}

interface AuditGeneration {
  id: string;
  status: "QUEUED" | "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "STOPPED" | "FAILED";
  stage: "QUEUED" | "RESEARCH" | "ANALYSIS" | "QUALITY_GATE" | "DELIVERY" | "COMPLETE" | "REVIEW" | "STOPPED";
  quality_outcome: string | null;
  confidence_band: string | null;
  failure_message_safe: string | null;
  stage_updated_at: string;
}

const PROCESSING_STAGES = [
  { key: "QUEUED", label: "Information received" },
  { key: "RESEARCH", label: "Grounded business research" },
  { key: "ANALYSIS", label: "Business and growth analysis" },
  { key: "QUALITY_GATE", label: "Evidence and quality checks" },
  { key: "DELIVERY", label: "Secure report delivery" },
  { key: "COMPLETE", label: "Report ready" },
] as const;

/** Payment-first Audit hub driven only by persisted order and generation state. */
export default function AuditHubPage() {
  const [order, setOrder] = useState<AuditOrder | null | undefined>(undefined);
  const [generation, setGeneration] = useState<AuditGeneration | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const autoStartAttempted = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await loadCustomerJson<{
      order?: AuditOrder | null;
      generation?: AuditGeneration | null;
      paymentUrl?: string | null;
    }>(() => fetch("/api/platform/audit/checkout"), "We couldn't load your Audit. Please try again.");
    if (result.status === "error") {
      setOrder(null);
      setGeneration(null);
      setPaymentUrl(null);
      setError(result.message);
      return;
    }
    setOrder(result.data.order ?? null);
    setGeneration(result.data.generation ?? null);
    setPaymentUrl(result.data.paymentUrl ?? null);
  }, []);

  const startAudit = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await loadCustomerJson<Record<string, unknown>>(
        () => fetch("/api/platform/audit/intake", { method: "POST" }),
        "We couldn't start your Audit. Please try again."
      );
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      trackFunnel("audit_started", { surface: "app_audit" });
      await load();
    } finally {
      setStarting(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order || order.status !== "in_review") return;
    if (generation && ["COMPLETED", "NEEDS_REVIEW", "FAILED", "STOPPED"].includes(generation.status)) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [order, generation, load]);

  useEffect(() => {
    if (!order || deriveAuditCustomerState(order) !== "READY_FOR_EXECUTION" || autoStartAttempted.current) return;
    autoStartAttempted.current = true;
    void startAudit();
  }, [order, startAudit]);

  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!order) return;
    const customerState = deriveAuditCustomerState(order);
    if (customerState === "INTAKE_REQUIRED" && !trackedRef.current.has("intake_started")) {
      trackedRef.current.add("intake_started");
      trackFunnel("audit_intake_started", { surface: "app_audit" });
    }
    if (customerState === "DELIVERED" && !trackedRef.current.has("report_ready")) {
      trackedRef.current.add("report_ready");
      trackFunnel("audit_report_ready", { surface: "app_audit" });
    }
  }, [order]);

  if (order === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorState
          message={error}
          onRetry={() => {
            autoStartAttempted.current = false;
            setOrder(undefined);
            void load();
          }}
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">You haven&apos;t started an Audit yet</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Start with the ₹999 AI Business Growth Audit.</p>
        <Link
          href="/audit"
          className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
        >
          Start My Audit &rarr;
        </Link>
      </div>
    );
  }

  const customerState = deriveAuditCustomerState(order);

  if (customerState === "PAYMENT_PENDING") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your payment isn&apos;t confirmed yet</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Finish paying to unlock your Audit.</p>
        {paymentUrl ? (
          <a
            href={paymentUrl}
            className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
          >
            Resume payment &rarr;
          </a>
        ) : (
          <Link href="/audit/checkout" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]">
            Resume payment &rarr;
          </Link>
        )}
      </div>
    );
  }

  if (customerState === "CLOSED") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your Audit order was {order.status}</h1>
        <Link href="/contact?intent=consultation" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Talk to the team &rarr;
        </Link>
      </div>
    );
  }

  if (customerState === "INTAKE_REQUIRED") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 text-center">
          <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-emerald-600">Purchase ✓</span>
          <h1 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text">Let&apos;s build your Brand Brain.</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-sx-text-muted">
            Answer a few simple questions. We&apos;ll turn them into your reusable Stratxcel Brand Brain so the Audit understands your business properly.
          </p>
        </div>
        <IntakeWizard order={order} onIntakeComplete={load} />
      </div>
    );
  }

  if (customerState === "READY_FOR_EXECUTION") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
        <h1 className="mt-5 font-sx-sans text-xl font-semibold text-sx-text">Starting your Audit</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Your Brand Brain is saved. Processing starts automatically.</p>
        {starting && <p className="mt-4 text-xs text-sx-text-subtle">Creating the secure research job&hellip;</p>}
      </div>
    );
  }

  if (
    customerState === "PROCESSING" &&
    generation &&
    (generation.status === "NEEDS_REVIEW" || generation.status === "FAILED")
  ) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your Audit needs a specialist check</h1>
        <p className="mt-2 text-sm leading-6 text-sx-text-muted">
          {generation.failure_message_safe ?? "The automatic checks did not clear this report for delivery. Nothing incomplete has been shown as final."}
        </p>
        <p className="mt-3 text-xs text-sx-text-subtle">The Stratxcel team can recover this without asking you to pay again.</p>
        <Link href="/contact?intent=audit-support" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Contact audit support &rarr;
        </Link>
      </div>
    );
  }

  if (customerState === "PROCESSING") {
    const foundIndex = generation
      ? PROCESSING_STAGES.findIndex((stage) => stage.key === generation.stage)
      : 0;
    const activeIndex = foundIndex < 0 ? 0 : foundIndex;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="text-center">
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">
            {generation ? "Your Audit is being prepared" : "Your Audit is being reviewed"}
          </h1>
          <p className="mt-2 text-sm text-sx-text-muted">
            {generation
              ? "Grounded research, analysis, and delivery checks are running in the background. You can safely leave this page."
              : "The Stratxcel team is working through your answers. We will let you know when it is ready."}
          </p>
        </div>
        <Card className="mt-8">
          <ol className="flex flex-col gap-2 text-sm text-sx-text-muted">
            {PROCESSING_STAGES.map((stage, index) => (
              <li key={stage.key} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${index <= activeIndex ? "bg-emerald-500" : "bg-sx-border-strong"}`} />
                <span className={index === activeIndex ? "font-medium text-sx-text" : ""}>{stage.label}</span>
              </li>
            ))}
          </ol>
        </Card>
        <p className="mt-4 text-center text-xs text-sx-text-subtle">
          {generation
            ? `Last confirmed stage update: ${new Date(generation.stage_updated_at).toLocaleString()}`
            : "Only the persisted review state above is confirmed."}
        </p>
      </div>
    );
  }

  const report = normalizeAuditDeliveryReport(order.report_data);

  if (customerState === "NEEDS_ATTENTION" || !report) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your report needs final review</h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Your Audit reached its final stage without a complete report attached. The Stratxcel team has been notified.
        </p>
        <Link href="/contact?intent=audit-support" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Contact audit support &rarr;
        </Link>
      </div>
    );
  }

  const researchLimits = report.researchLimitations ?? report.limitations ?? [];
  const sourceList = report.sources ?? [];
  const showCollapsedSources = sourceList.length > 3;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="border-b border-sx-border pb-6">
        <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Audit Report</span>
        <h1 className="mt-1 font-sx-sans text-2xl font-bold text-sx-text">{order.business_name}</h1>
      </div>

      <div className="mt-6 grid gap-4">
        {report.overallHealth && (
          <Card>
            <CardHeading>Overall business health</CardHeading>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="rounded-sx-sm bg-sx-surface-2 px-5 py-4 text-center">
                <p className="font-sx-sans text-3xl font-bold text-sx-text">{report.overallHealth.score}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-sx-text-subtle">Score out of 100</p>
              </div>
              <p className="min-w-[16rem] flex-1 text-sm leading-6 text-sx-text-muted">{report.overallHealth.explanation}</p>
            </div>
            <SectionFrame
              means="This is a readiness snapshot from your Brand Brain and the public evidence we could verify."
              matters="It helps you see where the business is strong versus where growth is blocked."
              todo="Use the category scores and plan below to decide what to fix first."
            />
          </Card>
        )}

        {report.categoryScores && (
          <Card>
            <CardHeading>Category scores</CardHeading>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {AUDIT_CATEGORY_SCORE_KEYS.map((key) => {
                const dimension = report.categoryScores![key];
                return (
                  <div key={key} className="rounded-sx-sm border border-sx-border p-3">
                    <dt className="text-xs font-medium text-sx-text">{CATEGORY_LABELS[key]}</dt>
                    <dd className="mt-2 font-sx-sans text-lg font-bold text-sx-text">
                      {dimension.score == null ? "Not enough data" : dimension.score}
                    </dd>
                    <p className="mt-2 text-xs leading-5 text-sx-text-muted">{dimension.explanation}</p>
                  </div>
                );
              })}
            </dl>
            <SectionFrame
              means="Each score is based only on evidence we could ground, or marked when evidence was missing."
              matters="Sparse public presence is treated as a real growth signal, not padded with invented numbers."
              todo="Prioritize categories marked “Not enough data” or with low scores that block customer acquisition."
            />
          </Card>
        )}

        {!report.overallHealth && report.scores && (
          <Card>
            <CardHeading>Business readiness scores</CardHeading>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Object.entries(report.scores).map(([key, value]) => (
                <div key={key} className="rounded-sx-sm bg-sx-surface-2 p-3 text-center">
                  <dd className="font-sx-sans text-xl font-bold text-sx-text">
                    {value == null ? "—" : value}
                  </dd>
                  <dt className="mt-1 text-[10px] uppercase tracking-wide text-sx-text-subtle">
                    {key.replace(/([A-Z])/g, " $1")}
                  </dt>
                </div>
              ))}
            </dl>
          </Card>
        )}

        <Card>
          <CardHeading>Executive summary</CardHeading>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sx-text-muted">{report.executiveSummary}</p>
        </Card>

        {report.strengths.length > 0 && (
          <Card>
            <CardHeading>What is working</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.strengths.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SectionFrame
              means="These are strengths already helping the business win customers or trust."
              matters="Protecting what works is cheaper than rebuilding it later."
              todo="Keep doing these consistently while you fix the higher-priority gaps."
            />
          </Card>
        )}

        {(report.growthProblems?.length ?? 0) > 0 && (
          <Card>
            <CardHeading>Growth problems</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.growthProblems!.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SectionFrame
              means="These are the patterns most likely to slow growth right now."
              matters="Fixing growth problems usually unlocks more demand than polishing already-strong areas."
              todo="Pair each problem with an owner action or a 30-day plan item below."
            />
          </Card>
        )}

        <Card>
          <CardHeading>Priority risks</CardHeading>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
            {report.priorityRisks.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <SectionFrame
            means="These risks can quietly leak sales, trust, or time if left alone."
            matters="Small retailers feel these first in missed enquiries and uneven follow-up."
            todo="Treat the top one or two as this month’s non-negotiable fixes."
          />
        </Card>

        {report.findings && report.findings.length > 0 && (
          <Card>
            <CardHeading>Evidence-backed findings</CardHeading>
            <div className="mt-3 grid gap-4">
              {report.findings.map((finding) => (
                <article key={finding.id} className="rounded-sx-sm border border-sx-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-sx-sans text-sm font-semibold text-sx-text">{finding.title}</h3>
                    <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                      {finding.impact} impact · {finding.confidence} confidence
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-sx-text-muted">{finding.summary}</p>
                  {finding.evidenceSourceIds.length > 0 && (
                    <p className="mt-2 font-sx-mono text-[10px] text-sx-text-subtle">
                      Evidence: {finding.evidenceSourceIds.join(", ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </Card>
        )}

        {report.opportunities && report.opportunities.length > 0 && (
          <Card>
            <CardHeading>Growth opportunities</CardHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {report.opportunities.map((opportunity) => (
                <article key={opportunity.title} className="rounded-sx-sm bg-sx-surface-2 p-4">
                  <h3 className="font-sx-sans text-sm font-semibold text-sx-text">{opportunity.title}</h3>
                  <p className="mt-2 text-sm text-sx-text-muted">{opportunity.rationale}</p>
                  <p className="mt-3 text-xs font-medium text-sx-text">Next: {opportunity.nextStep}</p>
                </article>
              ))}
            </div>
            <SectionFrame
              means="These are practical upside moves grounded in your evidence packet."
              matters="Opportunities turn the Audit from diagnosis into a growth agenda."
              todo="Pick one opportunity you can start without new software this week."
            />
          </Card>
        )}

        {(report.quickWins30Days?.length ?? 0) > 0 && (
          <Card>
            <CardHeading>Quick wins for the next 30 days</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.quickWins30Days!.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SectionFrame
              means="These are smaller moves that should create momentum quickly."
              matters="Early wins free time and confidence for the longer 60/90-day work."
              todo="Schedule the first quick win on your calendar this week."
            />
          </Card>
        )}

        <Card>
          <CardHeading>Recommended 90-day plan</CardHeading>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-sx-text-muted">
            {report.actionPlan.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </Card>

        {report.plan && (
          <Card>
            <CardHeading>Your 30 / 60 / 90-day plan</CardHeading>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {([
                ["First 30 days", report.plan.days30],
                ["Days 31–60", report.plan.days60],
                ["Days 61–90", report.plan.days90],
              ] as const).map(([label, items]) => (
                <section key={label} className="rounded-sx-sm border border-sx-border p-4">
                  <h3 className="font-sx-sans text-xs font-bold uppercase tracking-wide text-sx-text">{label}</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-sx-text-muted">
                    {items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </div>
            <SectionFrame
              means="The plan sequences work so you are not trying to fix everything at once."
              matters="A staged plan keeps a small team focused while still moving toward growth."
              todo="Own the first 30 days personally, then decide what needs help later."
            />
          </Card>
        )}

        {(report.ownerActions?.length ?? 0) > 0 && (
          <Card>
            <CardHeading>Owner actions</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.ownerActions!.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SectionFrame
              means="These are realistic DIY steps the business owner can take without waiting on a full agency build."
              matters="Owner-led follow-through is usually what turns an Audit into results."
              todo="Check off one owner action every few days until the first 30-day block is done."
            />
          </Card>
        )}

        {report.nextActions && report.nextActions.length > 0 && (
          <Card>
            <CardHeading>Next actions</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.nextActions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Card>
        )}

        {(report.stratxcelSupport?.length ?? 0) > 0 && (
          <Card>
            <CardHeading>Where Stratxcel can help</CardHeading>
            <div className="mt-3 grid gap-3">
              {report.stratxcelSupport!.map((item) => (
                <article key={`${item.capability}-${item.recommendation}`} className="rounded-sx-sm border border-sx-border p-4">
                  <h3 className="font-sx-sans text-sm font-semibold text-sx-text">{item.capability}</h3>
                  <p className="mt-2 text-sm text-sx-text-muted">{item.recommendation}</p>
                  <p className="mt-2 text-xs leading-5 text-sx-text-subtle">{item.why}</p>
                </article>
              ))}
            </div>
            <SectionFrame
              means="These are optional support areas only where the Audit found a clear fit."
              matters="You can ignore this section and still execute the owner actions yourself."
              todo="If you want help, start with the complimentary review call — no pressure."
            />
          </Card>
        )}

        {sourceList.length > 0 && (
          <Card>
            <CardHeading>Sources</CardHeading>
            {showCollapsedSources ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-sx-text">
                  Show {sourceList.length} sources
                </summary>
                <ol className="mt-3 space-y-3 text-sm">
                  {sourceList.map((source) => (
                    <li key={source.id} className="break-words">
                      <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-sx-accent hover:underline">
                        {source.title || source.url}
                      </a>
                      <span className="ml-2 font-sx-mono text-[10px] text-sx-text-subtle">{source.id}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : (
              <ol className="mt-3 space-y-3 text-sm">
                {sourceList.map((source) => (
                  <li key={source.id} className="break-words">
                    <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-sx-accent hover:underline">
                      {source.title || source.url}
                    </a>
                    <span className="ml-2 font-sx-mono text-[10px] text-sx-text-subtle">{source.id}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}

        {researchLimits.length > 0 && (
          <Card>
            <CardHeading>What we could not fully verify</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {researchLimits.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <SectionFrame
              means="These are honest limits of the public research available for this Audit."
              matters="Knowing the gaps prevents overconfidence in thin evidence."
              todo="Treat recommendations tied to these limits as provisional until you confirm them yourself."
            />
          </Card>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/contact?intent=consultation"
          onClick={() => trackFunnel("consultation_requested", { surface: "app_audit_report" })}
          className="rounded-sx-sm bg-sx-accent px-8 py-3 font-sx-sans text-xs font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
        >
          Book your complimentary Audit Review &rarr;
        </Link>
      </div>
    </div>
  );
}
