"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIT_CHANNEL_LABELS, AUDIT_CHANNEL_TYPES, type AuditChannelType } from "@/lib/audit/v1/channels";
import { selectAdaptiveQuestions } from "@/lib/audit/v1/adaptive-questions";
import { parseOnboardingState, resumeStep, type AuditOnboardingState } from "@/lib/audit/v1/onboarding-state";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import { WhatsAppDestinationField } from "@/components/audit/WhatsAppDestinationField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { normalizePlatformInput, type SupportedPlatform } from "@/lib/identity/smart-url";
import type { CandidateGoal } from "@/lib/audit/v1/smart-discovery";

const DISCOVERY_MILESTONES = [
  { id: "website", label: "Website discovered" },
  { id: "research", label: "Researching business identity" },
  { id: "social", label: "Finding social profiles" },
  { id: "google", label: "Checking Google presence" },
  { id: "reviews", label: "Collecting public reviews" },
  { id: "signals", label: "Mapping your market signals" },
] as const;

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
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [manualInputModal, setManualInputModal] = useState<{ platform: SupportedPlatform; raw: string; preview: { canonicalUrl?: string; displayHandle?: string } | null } | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [businessStage, setBusinessStage] = useState<string>(initial?.profile?.businessStage || "EARLY BUSINESS");
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
    setMilestoneIndex(0);
    setBusy(true);
    setError(null);

    const mTimer = setInterval(() => {
      setMilestoneIndex((prev) => (prev < DISCOVERY_MILESTONES.length - 1 ? prev + 1 : prev));
    }, 900);

    if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
    discoveryTimerRef.current = setTimeout(() => {
      setDiscoveryStatus("TIMEOUT");
      clearInterval(mTimer);
      setBusy(false);
    }, 10000);

    try {
      setDiscoveryStatus("FETCHING");
      const res = await fetch("/api/platform/audit/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", websiteUrl: targetUrl }),
      });
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
      clearInterval(mTimer);

      const json = await res.json() as {
        error?: string;
        state?: AuditOnboardingState;
        discoveryData?: Record<string, unknown>;
      };
      if (!res.ok) {
        setDiscoveryStatus("FAILED");
        setError(json.error || "We couldn't fully read this website.");
        return;
      }
      setDiscoveryStatus("COMPLETE");
      setMilestoneIndex(DISCOVERY_MILESTONES.length);
      if (json.state) {
        setState(json.state);
        if (json.state.channels) setChannels(json.state.channels);
        if (json.state.profile?.businessStage) setBusinessStage(json.state.profile.businessStage);
      }
      await onChanged();
    } catch (err) {
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
      clearInterval(mTimer);
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
    const serialized = JSON.stringify({ answers, waCountry, waNational, waConsent, selectedGoals });
    if (serialized === savedAnswers.current) return;
    const timer = window.setTimeout(() => {
      savedAnswers.current = serialized;
      void fetch("/api/platform/audit/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_answers",
          answers: {
            ...answers,
            primaryGoal: selectedGoals[0] || answers.primaryGoal || answers.ninetyDayResult || "",
          },
          whatsappDelivery: { countryIso: waCountry, nationalNumber: waNational, consent: waConsent },
        }),
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, waCountry, waNational, waConsent, selectedGoals, step]);

  const questions = useMemo(() => selectAdaptiveQuestions(state?.profile ?? {}), [state?.profile]);
  const candidateGoals: CandidateGoal[] = useMemo(() => {
    return state?.profile?.candidateGoals ?? [
      { id: "lead_gen", label: "Generate more qualified customer leads", rationale: "Recommended for service business", isRecommended: true },
      { id: "local_vis", label: "Improve Google discovery & local visibility", rationale: "Strengthen high-intent local search", isRecommended: true },
      { id: "social_auto", label: "Automate social media publishing & growth", rationale: "Maintain daily presence effortlessly", isRecommended: true },
      { id: "wa_auto", label: "Automate WhatsApp lead response 24/7", rationale: "Instant lead qualification", isRecommended: true },
    ];
  }, [state?.profile?.candidateGoals]);

  const isPreLaunch = businessStage === "IDEA" || businessStage === "PRE-LAUNCH";

  function handleManualModalChange(value: string) {
    if (!manualInputModal) return;
    const normalized = normalizePlatformInput(manualInputModal.platform, value);
    setManualInputModal({
      ...manualInputModal,
      raw: value,
      preview: normalized.ok ? { canonicalUrl: normalized.canonicalUrl, displayHandle: normalized.displayHandle } : null,
    });
  }

  function confirmManualPlatform() {
    if (!manualInputModal || !manualInputModal.preview?.canonicalUrl) return;
    const pType = manualInputModal.platform as AuditChannelType;
    const newChan = {
      id: pType,
      type: pType,
      value: manualInputModal.preview.canonicalUrl,
      notAvailable: false,
    };
    const updated = channels.filter((c) => c.type !== pType).concat(newChan);
    setChannels(updated);
    setManualInputModal(null);
    void call("save_connect", { websiteUrl: website || existingWebsite, channels: updated });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {error && <p className="mb-6 rounded-sx-sm border border-sx-danger/40 bg-sx-danger/10 px-4 py-3 text-sm text-sx-danger">{error}</p>}

      {/* STEP 1: CONNECT YOUR BUSINESS */}
      {step === "connect" && (
        <section className="space-y-6">
          <div className="border-b border-sx-border pb-6">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Step 1 of 5 · Discovery</span>
            <h1 className="mt-2 font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">Connect your business</h1>
            <p className="mt-2 text-sm leading-relaxed text-sx-text-muted sm:text-base">
              Connect your business once. Stratxcel will research what it can find and prepare your business profile automatically.
            </p>
          </div>

          {hasExistingProfile && (
            <Card className="border-sx-accent/30 bg-sx-accent/5 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sx-accent">Discovered Workspace Profile</span>
                <StatusChip state="success">Ready to Audit</StatusChip>
              </div>
              <p className="mt-2 text-lg font-bold text-sx-text">{canonicalBusinessName}</p>
              <p className="text-xs text-sx-accent break-all">{existingWebsite}</p>
              {brandBrain?.industry ? (
                <p className="mt-1 text-xs text-sx-text-muted">Industry: {String(brandBrain.industry)}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={busy} onClick={() => handleContinueAnyway()}>
                  {busy ? "Loading…" : "Use existing profile & continue →"}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => triggerSmartDiscovery(existingWebsite)}>
                  Re-scan website
                </Button>
              </div>
            </Card>
          )}

          <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 space-y-4">
            <label className="block text-sm font-semibold text-sx-text">
              <span className="inline-flex items-center gap-2"><PlatformIcon name="website" /> Your website</span>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="example.com or https://yourbusiness.in"
                className="mt-2 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-4 py-3 text-base text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:ring-2 focus:ring-sx-accent/20"
              />
              <span className="mt-1 block text-xs text-sx-text-subtle">
                Accepts domains, URLs with paths, or copied browser links. Normalized automatically.
              </span>
            </label>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="touch"
                disabled={busy || !website.trim()}
                onClick={() => {
                  const targetUrl = website.trim();
                  void call("save_connect", { websiteUrl: targetUrl, channels }).then((ok) => {
                    if (ok) triggerSmartDiscovery(targetUrl);
                  });
                }}
              >
                {busy ? "Starting Discovery…" : "Start Business Discovery →"}
              </Button>
              <Button
                variant="ghost"
                size="touch"
                disabled={busy}
                onClick={() => handleContinueAnyway()}
              >
                Enter details manually without scanning
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 2: BACKGROUND DISCOVERY */}
      {step === "discovering" && (
        <section className="space-y-6 text-center py-6">
          {discoveryStatus === "FAILED" || discoveryStatus === "TIMEOUT" ? (
            <Card className="border-sx-warning/40 bg-sx-warning/5 p-6 sm:p-8">
              <h2 className="font-sx-sans text-xl font-bold text-sx-text">We couldn&apos;t fully read your website.</h2>
              <p className="mt-2 text-sm text-sx-text-muted">
                Your site might be protected or slow to respond. You can retry discovery or continue with connections manually.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="primary" size="sm" disabled={busy} onClick={() => triggerSmartDiscovery(website || existingWebsite)}>
                  {busy ? "Retrying…" : "Retry discovery"}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleContinueAnyway()}>
                  Continue with connections →
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 sm:p-8 space-y-6">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
              <div>
                <h1 className="font-sx-sans text-2xl font-bold text-sx-text">Researching your business</h1>
                <p className="mt-1 text-sm text-sx-text-muted">
                  Stratxcel is analyzing your public pages, search presence, and social signals in the background.
                </p>
              </div>

              <div className="mx-auto max-w-md rounded-sx-md border border-sx-border bg-sx-surface-2 p-4 text-left">
                <ul className="space-y-2.5">
                  {DISCOVERY_MILESTONES.map((m, idx) => {
                    const isDone = idx < milestoneIndex;
                    const isActive = idx === milestoneIndex;
                    return (
                      <li key={m.id} className="flex items-center gap-3 text-sm">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                          isDone ? "bg-emerald-500 text-black" : isActive ? "border-2 border-sx-accent animate-pulse text-sx-accent" : "border border-sx-border text-sx-text-subtle"
                        }`}>
                          {isDone ? "✓" : idx + 1}
                        </span>
                        <span className={isDone || isActive ? "font-semibold text-sx-text" : "text-sx-text-subtle"}>
                          {m.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleContinueAnyway()}
                  className="text-xs text-sx-text-subtle underline hover:text-sx-text"
                >
                  Continue to connections while research completes →
                </button>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* STEP 3 & 4: CONNECT ACCOUNTS (OAUTH FIRST) & VERIFY PROFILE */}
      {step === "verify" && state?.profile && (
        <section className="space-y-6">
          <div className="border-b border-sx-border pb-6">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Step 2 of 5 · Verification</span>
            <h1 className="mt-2 font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">Here&apos;s what we found</h1>
            <p className="mt-2 text-sm text-sx-text-muted">
              Review what Stratxcel discovered. Connect OAuth accounts for authoritative private metrics or confirm public signals.
            </p>
          </div>

          {/* ONLINE PRESENCE & OAUTH CONNECTIONS CARD */}
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-sx-sans text-base font-bold text-sx-text">Online Presence & Accounts</h2>
                <span className="text-xs text-sx-text-subtle">Add business channel or connect OAuth for verified data</span>
              </div>
              <span className="text-xs text-sx-text-subtle">OAuth grants provide authoritative data</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {AUDIT_CHANNEL_TYPES.map((type) => {
                const channel = channels.find((c) => c.type === type && c.value && !c.notAvailable);
                const isGoogle = type === "google_business";
                const isOAuthSupported = type === "google_business" || type === "instagram" || type === "facebook" || type === "youtube" || type === "linkedin";

                return (
                  <div key={type} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-sx-text">
                          <PlatformIcon name={type} /> {AUDIT_CHANNEL_LABELS[type]}
                        </span>
                        {channel ? (
                          <StatusChip state="success">Discovered</StatusChip>
                        ) : (
                          <span className="text-[11px] text-sx-text-subtle">Not linked</span>
                        )}
                      </div>
                      {channel ? (
                        <p className="mt-2 text-xs font-mono text-sx-text break-all">
                          {channel.value}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-sx-text-subtle">Public profile or verified account</p>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-sx-border/60 flex flex-wrap gap-2">
                      {isOAuthSupported && (
                        <a
                          href={isGoogle ? "/app/settings" : `/api/social/oauth/${type}/connect?redirectTo=/app/audit`}
                          className="inline-flex items-center rounded-sx-sm bg-sx-surface-1 border border-sx-border-strong px-2.5 py-1 text-xs font-semibold text-sx-accent hover:bg-sx-surface-3"
                        >
                          Connect with OAuth
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setManualInputModal({ platform: type as SupportedPlatform, raw: channel?.value || "", preview: null })}
                        className="text-xs text-sx-text-subtle hover:text-sx-text underline"
                      >
                        {channel ? "Edit URL" : "Add URL manually"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* BUSINESS IDENTITY CARD */}
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sx-sans text-base font-bold text-sx-text">Business Profile</h2>
              <button
                type="button"
                onClick={() => setEditing(!editing)}
                className="text-xs font-semibold text-sx-accent hover:underline"
              >
                {editing ? "Done editing" : "Edit fields"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["name", "Business Name"],
                ["category", "Industry / Category"],
                ["location", "Location"],
                ["offer", "Primary Offering"],
                ["positioning", "Positioning / Description"],
                ["audience", "Target Audience Signals"],
              ] as const).map(([key, label]) => {
                const item = state.profile?.[key];
                const valueStr = typeof item?.value === "string" ? item.value : "";
                return (
                  <div key={key} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-sx-text-subtle">{label}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sx-text-subtle">
                        {item?.sourceClass === "VERIFIED_PUBLIC" ? "Publicly Discovered" : "Inferred"}
                      </span>
                    </div>
                    {editing ? (
                      <input
                        className="mt-1.5 w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 py-1.5 text-sm text-sx-text"
                        defaultValue={edits[key] !== undefined ? edits[key] : valueStr}
                        onChange={(e) => setEdits((curr) => ({ ...curr, [key]: e.target.value }))}
                        placeholder="Not found publicly"
                      />
                    ) : (
                      <p className="mt-1 text-sm font-medium text-sx-text">{valueStr || "Not detected publicly"}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* SERVICES LIST */}
            <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
              <span className="text-xs text-sx-text-subtle">Services & Solutions Discovered</span>
              <p className="mt-1 text-sm text-sx-text font-medium">
                {state.profile.services?.value?.length ? state.profile.services.value.join(", ") : "Detected from public pages"}
              </p>
            </div>
          </Card>

          {/* MARKET & SEARCH SIGNALS CARD */}
          <Card className="p-5 sm:p-6 space-y-4">
            <h2 className="font-sx-sans text-base font-bold text-sx-text">Market, Google & Search Signals</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
                <span className="text-xs text-sx-text-subtle">Public Google Presence</span>
                <p className="mt-1 text-sm text-sx-text font-semibold">
                  {state.channels.some((c) => c.type === "google_business" && c.value) ? "Google Listing / Maps Connected" : "Local search listing missing"}
                </p>
              </div>
              <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
                <span className="text-xs text-sx-text-subtle">Public Reviews & Trust Signals</span>
                <p className="mt-1 text-sm text-sx-text font-semibold">
                  {state.profile.reviews?.value?.rating ? `${state.profile.reviews.value.rating} ★ (${state.profile.reviews.value.count ?? "public"} reviews)` : "Signals detected on public pages"}
                </p>
              </div>
            </div>
          </Card>

          {/* GOALS & GROWTH STAGE CARD */}
          <Card className="p-5 sm:p-6 space-y-4">
            <h2 className="font-sx-sans text-base font-bold text-sx-text">Business Stage & Deliverable Route</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-sx-text-muted">Detected Business Stage:
                <select
                  value={businessStage}
                  onChange={(e) => setBusinessStage(e.target.value)}
                  className="ml-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs font-semibold text-sx-text"
                >
                  <option value="IDEA">Idea Stage</option>
                  <option value="PRE-LAUNCH">Pre-Launch</option>
                  <option value="NEW/STARTING">New / Starting Business</option>
                  <option value="EARLY BUSINESS">Early Operation</option>
                  <option value="GROWING">Growing Business</option>
                  <option value="ESTABLISHED">Established Business</option>
                </select>
              </label>
              <StatusChip state="accent">
                {isPreLaunch ? "Routes to: Business Plan" : "Routes to: Business Growth Audit"}
              </StatusChip>
            </div>
          </Card>

          <div className="pt-2 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="touch"
              disabled={busy}
              onClick={() => void call("verify", { profile: edits, businessStage, channels })}
            >
              {busy ? "Saving…" : "Looks right — Confirm Profile & Continue →"}
            </Button>
          </div>
        </section>
      )}

      {/* STEP 5: ANSWER ONLY MISSING QUESTIONS & GOALS */}
      {step === "questions" && (
        <section className="space-y-6">
          <div className="border-b border-sx-border pb-6">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">Step 3 of 5 · Priorities & Missing Details</span>
            <h1 className="mt-2 font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">A few questions about your growth</h1>
            <p className="mt-2 text-sm text-sx-text-muted">
              We&apos;ve skipped all questions answered by your website. Confirm your key 90-day priorities.
            </p>
          </div>

          {/* CANDIDATE GOAL SELECTOR */}
          <Card className="p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="font-sx-sans text-base font-bold text-sx-text">Suggested Growth Priorities</h2>
              <p className="mt-1 text-xs text-sx-text-muted">Inferred from your business signals. Select all that fit:</p>
            </div>

            <div className="grid gap-2.5">
              {candidateGoals.map((goal) => {
                const isChecked = selectedGoals.includes(goal.label);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => {
                      setSelectedGoals(
                        isChecked ? selectedGoals.filter((g) => g !== goal.label) : [...selectedGoals, goal.label]
                      );
                    }}
                    className={`flex items-start gap-3 rounded-sx-sm border p-3 text-left transition-colors ${
                      isChecked ? "border-sx-accent bg-sx-accent/10" : "border-sx-border bg-sx-surface-2 hover:bg-sx-surface-3"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      isChecked ? "border-sx-accent bg-sx-accent text-black font-bold" : "border-sx-border-strong"
                    }`}>
                      {isChecked && "✓"}
                    </span>
                    <div>
                      <span className="font-sx-sans text-sm font-semibold text-sx-text">{goal.label}</span>
                      <span className="mt-0.5 block text-xs text-sx-text-subtle">{goal.rationale}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* MISSING ADAPTIVE QUESTIONS */}
          {questions.filter((q) => q.id !== "primaryGoal").map((question) => (
            <Card key={question.id} className="p-5 sm:p-6 space-y-2">
              <label className="block text-sm font-semibold text-sx-text">
                {question.prompt}
                {question.helper && <span className="mt-1 block text-xs text-sx-text-muted">{question.helper}</span>}
                <textarea
                  value={answers[question.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                  placeholder="Your answer…"
                  className="mt-2 w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-2 text-sm text-sx-text"
                  rows={2}
                />
              </label>
              <div className="flex gap-3">
                <button type="button" className="text-xs text-sx-text-subtle hover:text-sx-text" onClick={() => setAnswers({ ...answers, [question.id]: "not_sure" })}>
                  Not sure
                </button>
                {question.optional && (
                  <button type="button" className="text-xs text-sx-text-subtle hover:text-sx-text" onClick={() => setAnswers({ ...answers, [question.id]: "skipped" })}>
                    Skip
                  </button>
                )}
              </div>
            </Card>
          ))}

          <Card className="p-5 sm:p-6 space-y-4">
            <h2 className="font-sx-sans text-base font-bold text-sx-text">WhatsApp Delivery & Updates</h2>
            <WhatsAppDestinationField
              countryIso={waCountry}
              nationalNumber={waNational}
              consent={waConsent}
              onCountry={setWaCountry}
              onNational={setWaNational}
              onConsent={setWaConsent}
            />
          </Card>

          <Button
            variant="primary"
            size="touch"
            disabled={busy}
            onClick={() =>
              void call("save_answers", {
                answers: {
                  ...answers,
                  primaryGoal: selectedGoals.join(", ") || answers.primaryGoal || answers.ninetyDayResult || "",
                },
                whatsappDelivery: { countryIso: waCountry, nationalNumber: waNational, consent: waConsent },
              }).then((ok) => ok && call("finalize"))
            }
          >
            {busy ? "Saving…" : isPreLaunch ? "Build Brand Brain & Generate Business Plan →" : "Build Brand Brain & Start Business Growth Audit →"}
          </Button>
        </section>
      )}

      {/* STEP 6: GENERATING DELIVERABLE */}
      {(step === "brain" || step === "generating") && (
        <section className="space-y-6 text-center py-12">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
          <h1 className="font-sx-sans text-2xl font-bold text-sx-text">
            {isPreLaunch ? "Creating your Business Plan" : "Creating your Business Growth Audit"}
          </h1>
          <p className="mx-auto max-w-md text-sm text-sx-text-muted">
            Stratxcel is synthesizing your website evidence, connected signals, and Brand Brain. You can safely leave this page.
          </p>
        </section>
      )}

      {/* MANUAL PLATFORM URL MODAL */}
      {manualInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h3 className="font-sx-sans text-lg font-bold text-sx-text">
              Add {AUDIT_CHANNEL_LABELS[manualInputModal.platform as AuditChannelType] || manualInputModal.platform}
            </h3>
            <p className="text-xs text-sx-text-muted">
              Paste profile URL, handle, or page link:
            </p>
            <input
              autoFocus
              value={manualInputModal.raw}
              onChange={(e) => handleManualModalChange(e.target.value)}
              placeholder="e.g. @mybusiness or https://..."
              className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-2 text-sm text-sx-text"
            />

            {manualInputModal.preview?.canonicalUrl && (
              <div className="rounded-sx-sm border border-sx-accent/30 bg-sx-accent/5 p-3 space-y-1">
                <span className="text-[11px] font-bold text-sx-accent uppercase tracking-wider">Preview</span>
                <p className="text-sm font-bold text-sx-text">{manualInputModal.preview.displayHandle}</p>
                <p className="text-xs font-mono text-sx-text-muted break-all">{manualInputModal.preview.canonicalUrl}</p>
                <p className="pt-1 text-xs text-sx-text-muted">Is this your account?</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setManualInputModal(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!manualInputModal.preview?.canonicalUrl}
                onClick={() => confirmManualPlatform()}
              >
                Confirm Account
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

