"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIT_CHANNEL_LABELS, AUDIT_CHANNEL_TYPES, type AuditChannelType } from "@/lib/audit/v1/channels";
import { selectAdaptiveQuestions } from "@/lib/audit/v1/adaptive-questions";
import { parseOnboardingState, resumeStep, type AuditOnboardingState } from "@/lib/audit/v1/onboarding-state";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import { WhatsAppDestinationField } from "@/components/audit/WhatsAppDestinationField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";

const PROGRESS = [
  "Connect your business",
  "Finding your business",
  "Reading your website",
  "Checking your public presence",
  "We found your business",
  "A few questions about your goals",
  "Building your Brand Brain",
  "Creating your Audit",
];

export function ConnectExperience({
  order,
  brandBrain,
  onChanged,
}: {
  order: { deep_dive_answers?: unknown; website_url?: string | null; business_name?: string | null };
  brandBrain?: Record<string, unknown> | null;
  onChanged: () => Promise<void>;
}) {
  const initial = parseOnboardingState(order.deep_dive_answers);
  const existingWebsite = initial?.websiteUrl || (order.website_url as string) || (brandBrain?.website_url as string) || "";
  const [website, setWebsite] = useState(existingWebsite);
  const [channels, setChannels] = useState(initial?.channels ?? []);
  const [addType, setAddType] = useState<AuditChannelType>("instagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AuditOnboardingState | null>(initial);
  const [answers, setAnswers] = useState<Record<string, string>>(initial?.adaptiveAnswers ?? {});
  const [waCountry, setWaCountry] = useState(initial?.whatsappDelivery?.countryIso ?? "IN");
  const [waNational, setWaNational] = useState(initial?.whatsappDelivery?.nationalNumber ?? "");
  const [waConsent, setWaConsent] = useState(initial?.whatsappDelivery?.consent === true);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [discoveryStatus, setDiscoveryStatus] = useState<"IDLE" | "VALIDATING" | "FETCHING" | "EXTRACTING" | "COMPLETE" | "PARTIAL" | "FAILED" | "TIMEOUT">("IDLE");
  const savedAnswers = useRef<string>("");
  const discoveryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const step = resumeStep(state);

  // Auto-fill from Brand Brain if available and profile is not yet confirmed
  const canonicalBusinessName = (brandBrain?.business_name as string) || (order.business_name as string) || "";
  const hasExistingProfile = Boolean(canonicalBusinessName && canonicalBusinessName !== "Pending — completed in intake" && existingWebsite);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/audit/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await response.json() as { error?: string; state?: AuditOnboardingState };
      if (!response.ok) throw new Error(json.error || "Could not save this step.");
      if (json.state) setState(json.state);
      await onChanged();
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this step.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function triggerSmartDiscovery(targetUrl: string) {
    setDiscoveryStatus("VALIDATING");
    setBusy(true);
    setError(null);

    // Bounded client watchdog timer (8 seconds max)
    if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
    discoveryTimerRef.current = setTimeout(() => {
      setDiscoveryStatus("TIMEOUT");
      setBusy(false);
    }, 8000);

    try {
      setDiscoveryStatus("FETCHING");
      const res = await fetch("/api/platform/audit/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", websiteUrl: targetUrl }),
      });
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);

      const json = await res.json() as { error?: string; state?: AuditOnboardingState; finalState?: string };
      if (!res.ok) {
        setDiscoveryStatus("FAILED");
        setError(json.error || "We couldn't fully read this website.");
        return;
      }
      setDiscoveryStatus("COMPLETE");
      if (json.state) setState(json.state);
      await onChanged();
    } catch (err) {
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
      setDiscoveryStatus("FAILED");
      setError(err instanceof Error ? err.message : "Could not read website.");
    } finally {
      setBusy(false);
    }
  }

  async function handleContinueAnyway() {
    if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
    setDiscoveryStatus("IDLE");
    await call("continue_anyway", { websiteUrl: website || existingWebsite });
  }

  // Recover from stale discovering step
  useEffect(() => {
    if (step === "discovering" && discoveryStatus === "IDLE") {
      const timer = setTimeout(() => {
        setDiscoveryStatus("TIMEOUT");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, discoveryStatus]);

  useEffect(() => {
    if (step !== "questions") return;
    const serialized = JSON.stringify({ answers, waCountry, waNational, waConsent });
    if (serialized === savedAnswers.current) return;
    const timer = window.setTimeout(() => {
      savedAnswers.current = serialized;
      void fetch("/api/platform/audit/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_answers",
          answers,
          whatsappDelivery: { countryIso: waCountry, nationalNumber: waNational, consent: waConsent },
        }),
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, waCountry, waNational, waConsent, step]);

  const questions = useMemo(() => selectAdaptiveQuestions(state?.profile ?? {}), [state?.profile]);
  const progressIndex = step === "connect" ? 0 : step === "discovering" ? 2 : step === "verify" ? 4 : step === "questions" ? 5 : 6;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sx-accent">{PROGRESS[progressIndex]}</p>
      {error && <p className="mt-3 rounded-sx-sm border border-sx-danger/40 bg-sx-danger/10 px-3 py-2 text-sm text-sx-danger">{error}</p>}

      {step === "connect" && (
        <section className="mt-6 space-y-4">
          <h1 className="font-sx-sans text-2xl font-semibold text-sx-text">Connect your business</h1>

          {hasExistingProfile && (
            <div className="rounded-sx-md border border-sx-accent/30 bg-sx-accent/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sx-accent">Known Business Profile</span>
                <StatusChip state="success">Ready</StatusChip>
              </div>
              <p className="mt-2 text-lg font-semibold text-sx-text">{canonicalBusinessName}</p>
              <p className="text-xs text-sx-text-muted">{existingWebsite}</p>
              {brandBrain?.industry ? (
                <p className="mt-1 text-xs text-sx-text-subtle">Industry: {String(brandBrain.industry)}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleContinueAnyway()}
                >
                  {busy ? "Loading…" : "Use existing profile & continue →"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => triggerSmartDiscovery(existingWebsite)}
                >
                  Re-scan website
                </Button>
              </div>
            </div>
          )}

          <p className="text-sm text-sx-text-muted">
            Start with your website. We will read public pages and then ask only what the internet cannot answer.
          </p>

          <label className="block text-sm font-medium text-sx-text">
            <span className="inline-flex items-center gap-2"><PlatformIcon name="website" /> Website</span>
            <input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              onBlur={() => {
                if (website.trim()) void call("save_connect", { websiteUrl: website, channels });
              }}
              placeholder="xyzconsultants.in"
              className="mt-1 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <label className="text-sm font-medium text-sx-text">Add business channel
              <select value={addType} onChange={(event) => setAddType(event.target.value as AuditChannelType)} className="mt-1 ml-2 rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-2 py-1 text-sm">
                {AUDIT_CHANNEL_TYPES.map((type) => (
                  <option key={type} value={type}>{AUDIT_CHANNEL_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <button type="button" className="ml-2 text-sm text-sx-accent" onClick={() => {
              if (channels.some((channel) => channel.type === addType)) return;
              setChannels([...channels, { id: addType, type: addType, value: "", notAvailable: false }]);
            }}>Add</button>
          </div>
          <ul className="space-y-3">
            {channels.map((channel) => (
              <li key={channel.type} className="rounded-sx-sm border border-sx-border p-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="inline-flex items-center gap-2"><PlatformIcon name={channel.type} /> {AUDIT_CHANNEL_LABELS[channel.type]}</span>
                  <button type="button" className="text-xs text-sx-text-subtle" onClick={() => setChannels(channels.filter((item) => item.type !== channel.type))}>Remove</button>
                </div>
                <input value={channel.value} disabled={channel.notAvailable} onChange={(event) => setChannels(channels.map((item) => item.type === channel.type ? { ...item, value: event.target.value } : item))} placeholder="Paste URL, domain, or @handle" className="mt-2 w-full rounded-sx-sm border border-sx-border px-3 py-2 text-sm" />
                <label className="mt-2 flex items-center gap-2 text-xs text-sx-text-muted">
                  <input type="checkbox" checked={channel.notAvailable} onChange={(event) => setChannels(channels.map((item) => item.type === channel.type ? { ...item, notAvailable: event.target.checked, value: event.target.checked ? "" : item.value } : item))} />
                  Not available
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !website.trim()}
              onClick={() => {
                const targetUrl = website.trim();
                void call("save_connect", { websiteUrl: targetUrl, channels }).then((ok) => {
                  if (ok) triggerSmartDiscovery(targetUrl);
                });
              }}
              className="min-h-11 rounded-sx-sm bg-sx-accent px-5 text-sm font-semibold text-sx-accent-on disabled:opacity-50"
            >
              {busy ? "Reading website…" : "Find my business"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleContinueAnyway()}
              className="min-h-11 rounded-sx-sm border border-sx-border-strong px-5 text-sm font-semibold text-sx-text hover:bg-sx-surface-2"
            >
              Continue without scanning
            </button>
          </div>
        </section>
      )}

      {step === "discovering" && (
        <section className="mt-10 text-center">
          {discoveryStatus === "FAILED" || discoveryStatus === "TIMEOUT" ? (
            <div className="rounded-sx-md border border-sx-warning/30 bg-sx-warning/5 p-6">
              <h2 className="font-sx-sans text-lg font-semibold text-sx-text">We couldn&apos;t fully read this website.</h2>
              <p className="mt-2 text-xs text-sx-text-muted">
                Your site might be protected or slow to respond. You can retry discovery or continue with what we already have.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => triggerSmartDiscovery(website || existingWebsite)}
                >
                  {busy ? "Retrying…" : "Retry discovery"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleContinueAnyway()}
                >
                  Continue anyway →
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
              <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Reading your website</h1>
              <p className="text-sm text-sx-text-muted">
                Checking public pages and presence. This takes a few seconds.
              </p>
              <div className="mx-auto mt-4 max-w-sm flex justify-center gap-2">
                <StatusChip state="ai" pulse={true}>
                  {discoveryStatus === "VALIDATING" ? "Validating URL…" : discoveryStatus === "FETCHING" ? "Fetching pages…" : "Analyzing content…"}
                </StatusChip>
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => handleContinueAnyway()}
                  className="text-xs text-sx-text-subtle underline hover:text-sx-text"
                >
                  Taking too long? Continue anyway →
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === "verify" && state?.profile && (
        <section className="mt-6 space-y-4">
          <h1 className="font-sx-sans text-2xl font-semibold text-sx-text">We found your business</h1>
          <p className="text-sm text-sx-text-muted">Check this against what you know. Your edits become the source of truth.</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-sx-sm bg-sx-surface-2 px-2 py-1 text-xs"><PlatformIcon name="website" /> Website</span>
            {state.channels.filter((channel) => channel.value && !channel.notAvailable).map((channel) => (
              <span key={channel.type} className="inline-flex items-center gap-1 rounded-sx-sm bg-sx-surface-2 px-2 py-1 text-xs">
                <PlatformIcon name={channel.type} /> {AUDIT_CHANNEL_LABELS[channel.type]}
              </span>
            ))}
          </div>
          {([
            ["name", "Name"],
            ["category", "Category"],
            ["location", "Location"],
            ["audience", "Audience"],
            ["offer", "Offer"],
            ["positioning", "Positioning"],
          ] as const).map(([key, label]) => {
            const item = state.profile?.[key];
            return (
              <div key={key} className="rounded-sx-sm border border-sx-border p-3">
                <p className="text-xs text-sx-text-subtle">{label} · {item?.sourceClass ?? "CUSTOMER_PROVIDED"}{item?.sourceUrl ? ` · public page` : ""}</p>
                {editing ? (
                  <input
                    className="mt-1 w-full rounded-sx-sm border border-sx-border px-3 py-2 text-sm"
                    defaultValue={typeof item?.value === "string" ? item.value : ""}
                    onChange={(event) => setEdits((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="Not found publicly"
                  />
                ) : (
                  <p className="text-sm text-sx-text">{typeof item?.value === "string" ? item.value : "Not found publicly"}</p>
                )}
              </div>
            );
          })}
          <div className="rounded-sx-sm border border-sx-border p-3">
            <p className="text-xs text-sx-text-subtle">Services · {state.profile.services?.sourceClass ?? "CUSTOMER_PROVIDED"}</p>
            <p className="text-sm text-sx-text">{state.profile.services?.value?.join(", ") || "Not found publicly"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => void call("verify", { profile: editing ? edits : {} })} className="min-h-11 rounded-sx-sm bg-sx-accent px-5 text-sm font-semibold text-sx-accent-on">Looks right</button>
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className="min-h-11 rounded-sx-sm border border-sx-border-strong px-5 text-sm font-semibold">Edit</button>
          </div>
        </section>
      )}

      {step === "questions" && (
        <section className="mt-6 space-y-4">
          <h1 className="font-sx-sans text-2xl font-semibold text-sx-text">A few questions about your goals</h1>
          {questions.map((question) => (
            <label key={question.id} className="block text-sm font-medium text-sx-text">
              {question.prompt}
              <textarea value={answers[question.id] ?? ""} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} className="mt-1 w-full rounded-sx-sm border border-sx-border px-3 py-2 text-sm" rows={3} />
              {question.optional && (
                <button type="button" className="mt-1 text-xs text-sx-text-subtle" onClick={() => setAnswers({ ...answers, [question.id]: "skipped" })}>Skip</button>
              )}
              <button type="button" className="ml-3 text-xs text-sx-text-subtle" onClick={() => setAnswers({ ...answers, [question.id]: "not_sure" })}>Not sure</button>
            </label>
          ))}
          <WhatsAppDestinationField
            countryIso={waCountry}
            nationalNumber={waNational}
            consent={waConsent}
            onCountry={setWaCountry}
            onNational={setWaNational}
            onConsent={setWaConsent}
          />
          <button
            disabled={busy}
            onClick={() =>
              void call("save_answers", {
                answers,
                whatsappDelivery: { countryIso: waCountry, nationalNumber: waNational, consent: waConsent },
              }).then((ok) => ok && call("finalize"))
            }
            className="min-h-11 rounded-sx-sm bg-sx-accent px-5 text-sm font-semibold text-sx-accent-on"
          >
            {busy ? "Saving…" : "Build my Brand Brain and start the Audit"}
          </button>
        </section>
      )}

      {(step === "brain" || step === "generating") && (
        <section className="mt-10 text-center">
          <h1 className="font-sx-sans text-xl font-semibold">Creating your Audit</h1>
          <p className="mt-2 text-sm text-sx-text-muted">Your growth plan is being created. You can leave this page.</p>
        </section>
      )}
    </div>
  );
}
