"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { IntakeWizard, type IntakeOrder } from "./IntakeWizard";
import { trackFunnel } from "@/lib/analytics/events";
import { deriveAuditCustomerState, normalizeAuditDeliveryReport } from "@/lib/audit/customer-state";

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
    try {
      const res = await fetch("/api/platform/audit/checkout");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load your Audit.");
        return;
      }
      setOrder(body.order ?? null);
      setGeneration(body.generation ?? null);
      setPaymentUrl(body.paymentUrl ?? null);
    } catch {
      setError("Network error loading your Audit.");
    }
  }, []);

  const startAudit = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/intake", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not start your Audit.");
        return;
      }
      trackFunnel("audit_started", { surface: "app_audit" });
      await load();
    } catch {
      setError("Network error starting your Audit.");
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="border-b border-sx-border pb-6">
        <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Audit Report</span>
        <h1 className="mt-1 font-sx-sans text-2xl font-bold text-sx-text">{order.business_name}</h1>
      </div>

      <div className="mt-6 grid gap-4">
        {report.scores && (
          <Card>
            <CardHeading>Business readiness scores</CardHeading>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Object.entries(report.scores).map(([key, value]) => (
                <div key={key} className="rounded-sx-sm bg-sx-surface-2 p-3 text-center">
                  <dd className="font-sx-sans text-xl font-bold text-sx-text">{value}</dd>
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
          </Card>
        )}

        <Card>
          <CardHeading>Priority risks</CardHeading>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
            {report.priorityRisks.map((item) => <li key={item}>{item}</li>)}
          </ul>
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
                  <p className="mt-2 font-sx-mono text-[10px] text-sx-text-subtle">
                    Evidence: {finding.evidenceSourceIds.join(", ")}
                  </p>
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
                ["Days 31-60", report.plan.days60],
                ["Days 61-90", report.plan.days90],
              ] as const).map(([label, items]) => (
                <section key={label} className="rounded-sx-sm border border-sx-border p-4">
                  <h3 className="font-sx-sans text-xs font-bold uppercase tracking-wide text-sx-text">{label}</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-sx-text-muted">
                    {items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </div>
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

        {report.sources && report.sources.length > 0 && (
          <Card>
            <CardHeading>Sources</CardHeading>
            <ol className="mt-3 space-y-3 text-sm">
              {report.sources.map((source) => (
                <li key={source.id} className="break-words">
                  <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-sx-accent hover:underline">
                    {source.title || source.url}
                  </a>
                  <span className="ml-2 font-sx-mono text-[10px] text-sx-text-subtle">{source.id}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {report.limitations && report.limitations.length > 0 && (
          <Card>
            <CardHeading>Evidence limits</CardHeading>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-sx-text-muted">
              {report.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
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

