"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { IntakeWizard, type IntakeOrder } from "./IntakeWizard";
import { trackFunnel } from "@/lib/analytics/events";

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
    const dd = order.deep_dive_answers ?? {};
    const goalsAns = order.goals_answers ?? {};
    const complete =
      Boolean(order.business_name && order.business_name !== "Pending — completed in intake" && order.industry && order.website_url) &&
      Boolean(dd.idealCustomers && dd.majorProducts && dd.competitors && dd.leadSources && dd.differentiation) &&
      Boolean(goalsAns.successDefinition && goalsAns.biggestObstacle && goalsAns.topPriorities);

    const tracked = trackedRef.current;
    if (order.status === "paid" && !complete && !tracked.has("intake_started")) {
      tracked.add("intake_started");
      trackFunnel("audit_intake_started", { surface: "app_audit" });
    }
    if (order.status === "completed" && Object.keys(order.report_data ?? {}).length > 0 && !tracked.has("report_ready")) {
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
        <p className="mt-2 text-sm text-sx-text-muted">Start with the ₹999 AI Business Growth Audit.</p>
        <Link
          href="/audit"
          className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
        >
          Start My Audit →
        </Link>
      </div>
    );
  }

  if (order.status === "pending_payment") {
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

  if (order.status === "refunded" || order.status === "cancelled") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your audit order was {order.status}</h1>
        <Link href="/contact?intent=consultation" className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm border border-sx-border-strong px-6 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
          Talk to the team →
        </Link>
      </div>
    );
  }

  const dd = order.deep_dive_answers ?? {};
  const goalsAns = order.goals_answers ?? {};
  const intakeComplete =
    Boolean(order.business_name && order.business_name !== "Pending — completed in intake" && order.industry && order.website_url) &&
    Boolean(dd.idealCustomers && dd.majorProducts && dd.competitors && dd.leadSources && dd.differentiation) &&
    Boolean(goalsAns.successDefinition && goalsAns.biggestObstacle && goalsAns.topPriorities);

  if (order.status === "paid" && !intakeComplete) {
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

  if (order.status === "paid" && intakeComplete) {
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

  if (order.status === "in_review") {
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

  // completed
  const report = order.report_data ?? {};
  const hasReport = Object.keys(report).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="border-b border-sx-border pb-6">
        <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Audit Report</span>
        <h1 className="mt-1 font-sx-sans text-2xl font-bold text-sx-text">{order.business_name}</h1>
      </div>

      {hasReport ? (
        <Card className="mt-6">
          <pre className="whitespace-pre-wrap text-xs text-sx-text-muted">{JSON.stringify(report, null, 2)}</pre>
        </Card>
      ) : (
        <Card className="mt-6 text-center">
          <CardHeading>Your audit is complete</CardHeading>
          <p className="mt-2 text-sm text-sx-text-muted">
            The Stratxcel team has finished reviewing your answers. Your written report is being finalised and will be shared
            with you directly.
          </p>
        </Card>
      )}

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
