"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { ConnectExperience } from "./ConnectExperience";
import { VisualAuditReport } from "./VisualAuditReport";
import { trackFunnel } from "@/lib/analytics/events";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import { parseOnboardingState } from "@/lib/audit/v1/onboarding-state";
import { verifiedReviewsFromProfile } from "@/lib/audit/v1/reviews";
import { AuditShareDialog } from "@/components/audit/AuditShareDialog";
import { AuditWhatsAppPanel } from "@/components/audit/AuditWhatsAppPanel";
import { Modal } from "@/components/ui/Overlay";
import { buildPresenceLinks } from "@/lib/audit/v1/presence";
import type { EvidenceCoverage } from "@/lib/audit/v1/scoring";
import {
  deriveAuditCustomerState,
  normalizeAuditDeliveryReport,
} from "@/lib/audit/customer-state";

interface IntakeOrder {
  business_name?: string | null;
  industry?: string | null;
  website_url?: string | null;
  deep_dive_answers?: Record<string, unknown> | null;
  goals_answers?: Record<string, unknown> | null;
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

function coverageFromOrder(order: AuditOrder, report: { sources?: unknown[] }): EvidenceCoverage {
  const state = parseOnboardingState(order.deep_dive_answers);
  const verifiedPublic = Object.values(state?.profile ?? {}).some((item) => {
    return Boolean(item && typeof item === "object" && "sourceClass" in item && (item as { sourceClass?: string }).sourceClass === "VERIFIED_PUBLIC");
  });
  const hasChannel = (type: string) => Boolean(state?.channels?.some((channel) => channel.type === type && channel.value && !channel.notAvailable));
  const reviews = verifiedReviewsFromProfile(state?.profile);
  return {
    website: verifiedPublic || Boolean(report.sources?.length),
    google: hasChannel("google_business"),
    instagram: hasChannel("instagram"),
    facebook: hasChannel("facebook"),
    reviews: Boolean(reviews),
    analytics: false,
  };
}

const PROCESSING_STAGES = [
  { key: "QUEUED", label: "Information received" },
  { key: "RESEARCH", label: "Reading your website" },
  { key: "ANALYSIS", label: "Checking your public presence" },
  { key: "QUALITY_GATE", label: "Building your growth plan" },
  { key: "DELIVERY", label: "Preparing your report" },
  { key: "COMPLETE", label: "Your growth plan is ready" },
] as const;

/** Payment-first Audit hub driven only by persisted order and generation state. */
export default function AuditHubPage() {
  const [order, setOrder] = useState<AuditOrder | null | undefined>(undefined);
  const [generation, setGeneration] = useState<AuditGeneration | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const autoStartAttempted = useRef(false);

  const [freshAuditEligible, setFreshAuditEligible] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [waDialog, setWaDialog] = useState<"number" | "consent" | null>(null);
  const [waCountry, setWaCountry] = useState("IN");
  const [waNational, setWaNational] = useState("");
  const [waConsent, setWaConsent] = useState(true);
  const [waMasked, setWaMasked] = useState<string | null>(null);
  const [waSent, setWaSent] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const closeWaDialog = useCallback(() => setWaDialog(null), []);

  const load = useCallback(async () => {
    setError(null);
    const result = await loadCustomerJson<{
      order?: AuditOrder | null;
      generation?: AuditGeneration | null;
      paymentUrl?: string | null;
      freshAuditEligible?: boolean;
      whatsappDestination?: { masked: string; countryIso: string; nationalNumber: string; consent: boolean } | null;
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
    setFreshAuditEligible(result.data.freshAuditEligible === true);
    const destination = result.data.whatsappDestination;
    if (destination) {
      setWaMasked(destination.masked);
      setWaCountry(destination.countryIso || "IN");
      setWaNational(destination.nationalNumber || "");
      setWaConsent(destination.consent);
    }
  }, []);

  const startAudit = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await loadCustomerJson<Record<string, unknown>>(
        () => fetch("/api/platform/audit/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize" }),
        }),
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
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">
          {freshAuditEligible ? "Your fresh Audit is ready to start" : "You haven't started an Audit yet"}
        </h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          {freshAuditEligible
            ? "Connect your business. We will read public pages and ask only a few questions."
            : "Start with the ₹999 AI Business Growth Audit."}
        </p>
        {freshAuditEligible ? (
          <button
            type="button"
            disabled={starting}
            onClick={() => {
              setStarting(true);
              void fetch("/api/platform/audit/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start_fresh" }),
              }).then(async (response) => {
                if (!response.ok) {
                  const json = await response.json().catch(() => ({})) as { error?: string };
                  setError(json.error ?? "Could not start a new Audit.");
                  return;
                }
                await load();
              }).finally(() => setStarting(false));
            }}
            className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on"
          >
            {starting ? "Starting…" : "Connect your business →"}
          </button>
        ) : (
          <Link
            href="/audit"
            className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
          >
            Start My Audit &rarr;
          </Link>
        )}
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
    return <ConnectExperience order={order} onChanged={load} />;
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
            {generation ? "Creating your Audit" : "Creating your Audit"}
          </h1>
          <p className="mt-2 text-sm text-sx-text-muted">
            Finding your business, reading your website, and building your growth plan. You can safely leave this page.
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
            ? `Last update: ${new Date(generation.stage_updated_at).toLocaleString()}`
            : "Your growth plan is being created."}
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

  async function openShare() {
    setShareMessage(null);
    const response = await fetch("/api/platform/audit/report/share", { method: "POST" });
    const json = await response.json() as { url?: string; error?: string };
    if (json.url) {
      setShareUrl(json.url);
      setShareOpen(true);
      return;
    }
    setShareMessage(json.error ?? "Could not create a share link.");
  }

  async function sendWhatsApp(payload: Record<string, unknown> = {}) {
    if (waSending || waSent) return;
    setWaSending(true);
    setShareMessage(null);
    try {
    const response = await fetch("/api/platform/audit/report/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json() as {
      status?: string;
      message?: string;
      destinationMasked?: string;
      error?: string;
    };
    if (json.status === "NO_DESTINATION") {
      setWaDialog("number");
      return;
    }
    if (json.status === "NO_CONSENT") {
      setWaDialog("consent");
      if (json.destinationMasked) setWaMasked(json.destinationMasked);
      return;
    }
    if (json.destinationMasked) setWaMasked(json.destinationMasked);
    if (json.status === "SENT" || json.status === "DELIVERED") {
      setWaSent(true);
      setShareMessage(json.message ?? "Sent to WhatsApp");
      setWaDialog(null);
      return;
    }
    setShareMessage(json.message ?? json.error ?? "WhatsApp delivery checked.");
    } finally {
      setWaSending(false);
    }
  }

  return (
    <>
      <VisualAuditReport
        report={report}
        coverage={coverageFromOrder(order, report)}
        reviews={verifiedReviewsFromProfile(parseOnboardingState(order.deep_dive_answers)?.profile)}
        presence={buildPresenceLinks({
          websiteUrl: order.website_url,
          channels: parseOnboardingState(order.deep_dive_answers)?.channels,
          verifiedPublicTypes: Object.entries(parseOnboardingState(order.deep_dive_answers)?.profile ?? {}).flatMap(([key, item]) =>
            item && typeof item === "object" && "sourceClass" in item && (item as { sourceClass?: string }).sourceClass === "VERIFIED_PUBLIC"
              ? [key === "websiteUrl" ? "website" : key]
              : [],
          ),
          whatsappDeliveryMasked: waMasked,
        })}
        onDownload={() => { window.open(`/api/platform/audit/report/pdf?order=${order.id}`, "_blank"); }}
        onShare={() => { void openShare(); }}
        onWhatsApp={() => { void sendWhatsApp(); }}
        whatsAppState={shareMessage ?? undefined}
        whatsAppMasked={waMasked}
        whatsAppSent={waSent}
      />
      <AuditShareDialog open={shareOpen} url={shareUrl} onClose={() => setShareOpen(false)} />
      <Modal open={waDialog === "number"} onClose={closeWaDialog} title="Add your WhatsApp number">
        <AuditWhatsAppPanel
          masked={null}
          consent={waConsent}
          sending={waSending}
          sent={waSent}
          statusMessage={shareMessage}
          countryIso={waCountry}
          nationalNumber={waNational}
          draftConsent={waConsent}
          onCountry={setWaCountry}
          onNational={setWaNational}
          onConsent={setWaConsent}
          onSend={() => void sendWhatsApp({
            destination: { countryIso: waCountry, nationalNumber: waNational },
            consent: waConsent,
          })}
          onChangeDestination={() => undefined}
        />
      </Modal>
      <Modal open={waDialog === "consent"} onClose={closeWaDialog} title="Allow WhatsApp delivery">
        <p className="text-sm text-sx-text-muted">
          Send my completed Audit and Audit-related updates to {waMasked ?? "this WhatsApp number"}.
        </p>
        <button
          type="button"
          disabled={waSending}
          className="mt-4 min-h-11 w-full rounded-sx-sm bg-sx-accent px-4 text-sm font-semibold text-sx-accent-on disabled:opacity-60"
          onClick={() => void sendWhatsApp({ consent: true })}
        >
          {waSending ? "Sending your Audit…" : "Enable consent and send"}
        </button>
      </Modal>
    </>
  );
}
