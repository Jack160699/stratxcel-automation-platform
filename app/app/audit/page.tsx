"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { VisualAuditReport } from "./VisualAuditReport";
import { trackFunnel } from "@/lib/analytics/events";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import { AuditShareDialog } from "@/components/audit/AuditShareDialog";
import { AuditWhatsAppPanel } from "@/components/audit/AuditWhatsAppPanel";
import { Modal } from "@/components/ui/Overlay";
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

const PROCESSING_STAGES = [
  { key: "QUEUED", label: "Business information received" },
  { key: "RESEARCH", label: "Public web presence researched" },
  { key: "ANALYSIS", label: "Website presence being analyzed" },
  { key: "QUALITY_GATE", label: "Google visibility & local search analysis" },
  { key: "DELIVERY", label: "Growth opportunities & gaps being identified" },
  { key: "COMPLETE", label: "30-day recommendations being prepared" },
] as const;

export default function AuditHubPage() {
  const [order, setOrder] = useState<AuditOrder | null | undefined>(undefined);
  const [generation, setGeneration] = useState<AuditGeneration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const autoStartAttempted = useRef(false);

  const [brandBrain, setBrandBrain] = useState<Record<string, unknown> | null>(null);
  const [googleBusinessConnectionState, setGoogleBusinessConnectionState] = useState<string | null>(null);
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
      brandBrain?: Record<string, unknown> | null;
      googleBusinessConnectionState?: string | null;
    }>(() => fetch("/api/platform/audit/checkout"), "We couldn't load your Audit. Please try again.");
    if (result.status === "error") {
      setOrder(null);
      setGeneration(null);
      setError(result.message);
      return;
    }
    setOrder(result.data.order ?? null);
    setGeneration(result.data.generation ?? null);
    setBrandBrain(result.data.brandBrain ?? null);
    setGoogleBusinessConnectionState(result.data.googleBusinessConnectionState ?? null);
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
    if (!order) return;
    const state = deriveAuditCustomerState(order);
    if ((state === "READY_FOR_EXECUTION" || state === "INTAKE_REQUIRED") && !autoStartAttempted.current) {
      autoStartAttempted.current = true;
      void startAudit();
    }
  }, [order, startAudit]);

  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!order) return;
    const customerState = deriveAuditCustomerState(order);
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
    const hasBrandBrain = Boolean(brandBrain && (brandBrain.business_name || brandBrain.website_url || brandBrain.google_maps_url));
    if (hasBrandBrain) {
      const bName = (brandBrain?.business_name as string) || "Your Business";
      const bWebsite = (brandBrain?.website_url as string) || "Not connected";
      // Real canonical connection state (not a raw "did onboarding see a Maps
      // URL" guess) -- a publicly discovered profile must read as discovered,
      // never as an authenticated connection that doesn't actually exist.
      const bGoogle =
        googleBusinessConnectionState === "CONNECTED"
          ? "Connected"
          : googleBusinessConnectionState === "DISCOVERED_PUBLICLY"
          ? "Found publicly"
          : googleBusinessConnectionState === "REAUTH_REQUIRED"
          ? "Needs reconnect"
          : "Not connected";
      const bSocials = Array.isArray(brandBrain?.verified_social_links) && (brandBrain.verified_social_links as any[]).length > 0
        ? (brandBrain.verified_social_links as Array<{ platform?: string; handle?: string }>)
            .map((s) => s.platform ? s.platform.charAt(0).toUpperCase() + s.platform.slice(1) : "")
            .filter(Boolean)
            .join(" · ")
        : "None connected";
      const bIndustry = (brandBrain?.industry as string) || "General Business";

      return (
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="text-center">
            <span className="inline-block rounded-full bg-sx-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sx-accent">
              Free Business Audit
            </span>
            <h1 className="mt-3 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
              Your business is connected
            </h1>
            <p className="mt-2 text-sm text-sx-text-muted">
              We have your verified business details from onboarding. We&rsquo;ll now analyze them and prepare your growth report.
            </p>
          </div>

          <div className="mt-6 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-sx-border/60 pb-3">
              <span className="text-xs font-semibold uppercase text-sx-text-subtle">Business Identity</span>
              <span className="font-bold text-sm text-sx-text">{bName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className="text-sx-text-subtle block">Website</span>
                <span className="font-mono text-sx-text font-medium break-all">{bWebsite}</span>
              </div>
              <div>
                <span className="text-sx-text-subtle block">Google Business Profile</span>
                <span className="font-medium text-sx-text">{bGoogle}</span>
              </div>
              <div>
                <span className="text-sx-text-subtle block">Industry</span>
                <span className="font-medium text-sx-text">{bIndustry}</span>
              </div>
              <div>
                <span className="text-sx-text-subtle block">Connected Channels</span>
                <span className="font-medium text-sx-text">{bSocials}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
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
                    setError(json.error ?? "Could not start your free Audit.");
                    return;
                  }
                  await load();
                }).finally(() => setStarting(false));
              }}
              className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center rounded-sx-sm bg-sx-accent px-8 font-sx-sans text-sm font-bold text-sx-accent-on shadow-sm hover:bg-[color:var(--sx-accent-hover)] transition-colors"
            >
              {starting ? "Starting Your Free Audit…" : "Start Free Audit →"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">
          Start your free business audit
        </h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Complete the quick setup to connect your business and generate your growth report — 100% free.
        </p>
        <Link
          href="/app"
          className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
        >
          Start Onboarding →
        </Link>
      </div>
    );
  }

  const customerState = deriveAuditCustomerState(order);

  if (customerState === "PAYMENT_PENDING") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Start Your Free Business Audit</h1>
        <p className="mt-2 text-sm text-sx-text-muted">The audit is 100% free. Click below to begin research.</p>
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
                setError(json.error ?? "Could not start your free Audit.");
                return;
              }
              await load();
            }).finally(() => setStarting(false));
          }}
          className="mt-6 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-6 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
        >
          {starting ? "Starting…" : "Start Free Audit →"}
        </button>
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

  if (customerState === "READY_FOR_EXECUTION" || customerState === "INTAKE_REQUIRED") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
        <h1 className="mt-5 font-sx-sans text-xl font-semibold text-sx-text">Starting your Free Business Audit</h1>
        <p className="mt-2 text-sm text-sx-text-muted">Your business details are verified. Starting research automatically…</p>
        {starting && <p className="mt-4 text-xs text-sx-text-subtle">Initializing research job…</p>}
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
          <span className="inline-block rounded-full bg-sx-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sx-accent">
            Audit Research Active
          </span>
          <h1 className="mt-3 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Your Free Business Audit is underway
          </h1>
          <p className="mt-2 text-sm text-sx-text-muted">
            StratXcel is researching your business across the public web and your website. You can safely leave this page.
          </p>
        </div>
        <Card className="mt-8 p-6">
          <ol className="flex flex-col gap-3.5 text-sm text-sx-text-muted">
            {PROCESSING_STAGES.map((stage, index) => {
              const isDone = index < activeIndex;
              const isCurrent = index === activeIndex;
              return (
                <li key={stage.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDone
                        ? "bg-sx-success/20 text-sx-success"
                        : isCurrent
                        ? "bg-sx-accent text-sx-accent-on animate-pulse"
                        : "bg-sx-surface-2 text-sx-text-subtle"
                    }`}
                  >
                    {isDone ? "✓" : isCurrent ? "●" : "○"}
                  </span>
                  <span className={isCurrent ? "font-semibold text-sx-text" : isDone ? "text-sx-text-muted" : "text-sx-text-subtle"}>
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
        <p className="mt-4 text-center text-xs text-sx-text-subtle">
          {generation
            ? `Last update: ${new Date(generation.stage_updated_at).toLocaleString()}`
            : "Your growth audit is being created."}
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
    if (!response.ok || !json.url) {
      setShareMessage(json.error ?? "Could not generate a share link.");
      return;
    }
    setShareUrl(json.url);
    setShareOpen(true);
  }

  async function handleSendWhatsApp(payload: { nationalNumber: string; countryIso: string; consent: boolean }) {
    setWaSending(true);
    try {
      const response = await fetch("/api/platform/audit/report/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json() as { error?: string; masked?: string };
      if (!response.ok) {
        setError(json.error ?? "Could not send report via WhatsApp.");
        return;
      }
      setWaSent(true);
      if (json.masked) setWaMasked(json.masked);
      setWaDialog(null);
    } catch {
      setError("Network error while sending to WhatsApp.");
    } finally {
      setWaSending(false);
    }
  }

  return (
    <div data-sx-ui="new-audit" className="mx-auto w-full max-w-full sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <VisualAuditReport
        report={report}
        onDownload={() => {
          window.open("/api/platform/audit/report/pdf", "_blank");
        }}
        onShare={openShare}
        onWhatsApp={() => setWaDialog(waMasked ? "consent" : "number")}
      />

      {shareOpen && shareUrl && (
        <AuditShareDialog
          url={shareUrl}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}

      {waDialog && (
        <Modal open={Boolean(waDialog)} onClose={closeWaDialog} title="Send Audit Report to WhatsApp">
          <AuditWhatsAppPanel
            countryIso={waCountry}
            nationalNumber={waNational}
            consent={waConsent}
            draftConsent={waConsent}
            masked={waMasked}
            sending={waSending}
            sent={waSent}
            onCountry={setWaCountry}
            onNational={setWaNational}
            onConsent={setWaConsent}
            onSend={() => void handleSendWhatsApp({ countryIso: waCountry, nationalNumber: waNational, consent: waConsent })}
            onChangeDestination={() => setWaDialog("number")}
          />
        </Modal>
      )}
    </div>
  );
}
