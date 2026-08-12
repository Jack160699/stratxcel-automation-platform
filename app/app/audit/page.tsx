"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { IntakeWizard, type IntakeOrder } from "./IntakeWizard";
import { trackFunnel } from "@/lib/analytics/events";
import { deriveAuditCustomerState, normalizeAuditDeliveryReport } from "@/lib/audit/customer-state";

interface AuditOrder extends IntakeOrder {
  id: string;
  status: "pending_payment" | "paid" | "in_review" | "completed" | "refunded" | "cancelled";
  report_data: Record<string, unknown> | null;
}

const PROCESSING_STAGES = [
  "Information received",
  "Business research",
  "Digital presence analysis",
  "Competitive analysis",
  "Growth opportunities",
  "Recommendations",
  "Report preparation",
] as const;

/**
 * The whole payment-first Audit hub — one page, state driven entirely by the
 * customer's real audit_orders row (fetched from GET /api/platform/audit/checkout,
 * which already resolves it from the caller's own tenant). No step here is
 * ever assumed; every branch below reflects exactly what's persisted.
 */
export default function AuditHubPage() {
  const [order, setOrder] = useState<AuditOrder | null | undefined>(undefined);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/checkout");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load your audit.");
        return;
      }
      setOrder(body.order ?? null);
      setPaymentUrl(body.paymentUrl ?? null);
    } catch {
      setError("Network error loading your audit.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Fire funnel events exactly once per real state transition, not on every
  // render — a ref-backed guard, since these are side effects of state the
  // server told us about, not of a user action we can hang the event on.
  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!order) return;
    const customerState = deriveAuditCustomerState(order);

    const tracked = trackedRef.current;
    if (customerState === "INTAKE_REQUIRED" && !tracked.has("intake_started")) {
      tracked.add("intake_started");
      trackFunnel("audit_intake_started", { surface: "app_audit" });
    }
    if (customerState === "DELIVERED" && !tracked.has("report_ready")) {
      tracked.add("report_ready");
      trackFunnel("audit_report_ready", { surface: "app_audit" });
    }
  }, [order]);

  async function startAudit() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/intake", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not start your audit.");
        return;
      }
      trackFunnel("audit_started", { surface: "app_audit" });
      await load();
    } finally {
      setStarting(false);
    }
  }

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
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  // No audit purchased yet — send back to the paid entry point rather than
  // duplicating the payment explainer here.
  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">You haven&rsquo;t started an Audit yet</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Start with the ₹999 staff-delivered Business Growth Audit.</p>
        <Link
          href="/audit"
          className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
        >
          Start My Audit →
        </Link>
      </div>
    );
  }

  const customerState = deriveAuditCustomerState(order);

  if (customerState === "PAYMENT_PENDING") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your payment isn&rsquo;t confirmed yet</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Finish paying to unlock your Audit.</p>
        {paymentUrl ? (
          <a
            href={paymentUrl}
            className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
          >
            Resume payment →
          </a>
        ) : (
          <Link href="/audit/checkout" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]">
            Resume payment →
          </Link>
        )}
      </div>
    );
  }

  if (customerState === "CLOSED") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your audit order was {order.status}</h1>
        <Link href="/contact?intent=consultation" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Talk to the team →
        </Link>
      </div>
    );
  }

  if (customerState === "INTAKE_REQUIRED") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 text-center">
          <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-emerald-600">Purchase ✓</span>
          <h1 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text">Your Stratxcel Audit has started.</h1>
          <p className="mt-2 text-sm text-sx-text-muted max-w-lg mx-auto">
            To make the report specific to your business, complete these three short sections.
          </p>
        </div>
        <IntakeWizard order={order} onIntakeComplete={load} />
      </div>
    );
  }

  if (customerState === "READY_FOR_EXECUTION") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Everything&rsquo;s in.</h1>
        <p className="mt-2 text-sm text-sx-text-muted">You can start your audit whenever you&rsquo;re ready.</p>
        {error && <div className="mt-4"><ErrorState message={error} /></div>}
        <Button variant="primary" size="touch" className="mt-6" onClick={startAudit} disabled={starting}>
          {starting ? "Starting…" : "Start My Audit →"}
        </Button>
      </div>
    );
  }

  if (customerState === "PROCESSING") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="text-center">
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your audit is being reviewed</h1>
          <p className="mt-2 text-sm text-sx-text-muted">
            The Stratxcel team is working through your answers. This isn&rsquo;t an automated countdown — we&rsquo;ll let you know
            when it&rsquo;s ready.
          </p>
        </div>
        <Card className="mt-8">
          <ol className="flex flex-col gap-2 text-sm text-sx-text-muted">
            {PROCESSING_STAGES.map((stage, i) => (
              <li key={stage} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-emerald-500" : "bg-sx-border-strong"}`} />
                {stage}
              </li>
            ))}
          </ol>
        </Card>
        <p className="mt-4 text-center text-xs text-sx-text-subtle">
          Only the stage above is confirmed — the rest happen with the team, not an automated engine yet.
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
          Your audit record reached its final stage without a complete report attached. The Stratxcel team has been notified;
          please contact us if you need immediate help.
        </p>
        <Link href="/contact?intent=audit-support" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Contact audit support →
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
        <Card>
          <CardHeading>Recommended 90-day plan</CardHeading>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-sx-text-muted">
            {report.actionPlan.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </Card>
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/contact?intent=consultation"
          onClick={() => trackFunnel("consultation_requested", { surface: "app_audit_report" })}
          className="rounded-sx-sm bg-sx-accent px-8 py-3 font-sx-sans text-xs font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
        >
          Book your complimentary Audit Review →
        </Link>
      </div>
    </div>
  );
}
