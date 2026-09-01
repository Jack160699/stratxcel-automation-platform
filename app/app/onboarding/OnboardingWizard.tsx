"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setActiveTenantAction } from "../tenant-actions";
import { StepWelcome } from "./steps/StepWelcome";
import { StepBusiness, type DiscoveryState } from "./steps/StepBusiness";
import { StepGoals, BUSINESS_GOALS } from "./steps/StepGoals";
import { StepBrand } from "./steps/StepBrand";
import { StepReview } from "./steps/StepReview";
import { ConnectorSheet } from "./ConnectorSheet";
import {
  EMPTY_DRAFT,
  ONBOARDING_DRAFT_KEY,
  ONBOARDING_STEP_LABELS,
  slugify,
  V1_CONNECTORS,
  type OnboardingDraft,
  type SocialConnection,
  type SocialPlatformKey,
  type V1SocialPlatformKey,
} from "./types";
import { trackFunnel } from "@/lib/analytics/events";
import { normalizeWebsiteUrl } from "@/lib/identity/smart-url";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
import { ContextSwitcher } from "@/components/shell/ContextSwitcher";

const TOTAL_STEPS = ONBOARDING_STEP_LABELS.length; // 5 — index-aligned with the reference's own step state (0-4)

// The only keys StepGoals can actually render as a checkbox/REC badge — used
// to filter out the industry-intelligence module's disjoint deliverable-key
// vocabulary before it reaches draft.goals (see applySynthesizedIntelligence).
const STEP_GOALS_KEYS = new Set(BUSINESS_GOALS.map((g) => g.key));

const PROVIDER_LABELS: Record<string, string> = {
  google_business: "Google",
  google: "Google",
  instagram: "Meta",
  facebook: "Meta",
  youtube: "Google",
  whatsapp: "WhatsApp Verified",
};

/**
 * Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md
 * (Platform Convergence): `ONBOARDING_DRAFT_KEY` is a single, fixed,
 * origin-scoped sessionStorage key with no user-id namespacing at all.
 * Real production evidence: `stratxcelsolutions@gmail.com` (a real,
 * distinct Google account, never a member of the real Stratxcel tenant)
 * reached onboarding twice, ~11 hours apart, and both the client draft and
 * the real per-user server draft correctly carried its own earlier input
 * forward -- that specific case was genuinely the same user resuming its
 * own draft, not a leak. But `loadDraft()`'s result was applied to state
 * completely unvalidated, with zero check that the currently authenticated
 * user is the same one who saved it. In the same browser tab, a second,
 * genuinely different, brand-new user (no server draft of their own yet)
 * would silently inherit whatever business name/industry/location a prior
 * user typed and abandoned in that tab -- exactly the "browser state
 * decides what looks like identity" failure mode Section 1 warns against,
 * just at the onboarding-form layer rather than tenant routing (the real
 * tenant-resolution chain, auth user id -> tenant_members -> tenant, was
 * traced end-to-end and found correct and deterministic; not touched here).
 * Fixed by stamping the persisted draft with the real authenticated user id
 * that saved it, and requiring a match before ever treating a client draft
 * as this user's own (see the `ownerUserId` check in `loadAccount`).
 */
function loadDraft(): { step: number; draft: OnboardingDraft; ownerUserId: string | null } {
  if (typeof window === "undefined") return { step: 0, draft: EMPTY_DRAFT, ownerUserId: null };
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return { step: 0, draft: EMPTY_DRAFT, ownerUserId: null };
    const parsed = JSON.parse(raw) as { step: number; draft: OnboardingDraft; ownerUserId?: string | null };
    if (!parsed?.draft) return { step: 0, draft: EMPTY_DRAFT, ownerUserId: null };
    return {
      step: Math.min(Math.max(parsed.step ?? 0, 0), TOTAL_STEPS - 1),
      draft: {
        ...EMPTY_DRAFT,
        ...parsed.draft,
        account: {
          ...EMPTY_DRAFT.account,
          ...parsed.draft.account,
          connections: parsed.draft.account?.connections || EMPTY_DRAFT.account.connections,
        },
      },
      ownerUserId: parsed.ownerUserId ?? null,
    };
  } catch {
    return { step: 0, draft: EMPTY_DRAFT, ownerUserId: null };
  }
}

function persistDraft(step: number, draft: OnboardingDraft, ownerUserId: string | null) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step, draft, ownerUserId }));
}

function mergeDraft(value: Partial<OnboardingDraft> | undefined): OnboardingDraft {
  return {
    ...EMPTY_DRAFT,
    ...value,
    account: {
      ...EMPTY_DRAFT.account,
      ...value?.account,
      connections: value?.account?.connections || EMPTY_DRAFT.account.connections,
    },
    business: { ...EMPTY_DRAFT.business, ...value?.business },
    brand: { ...EMPTY_DRAFT.brand, ...value?.brand },
    plan: { ...EMPTY_DRAFT.plan, ...value?.plan },
    goals: Array.isArray(value?.goals) ? value.goals : [],
  };
}

function mergeOAuthConnectionsIntoDraft(
  draft: OnboardingDraft,
  oauthConnections: Record<string, any>
): OnboardingDraft {
  if (!oauthConnections || Object.keys(oauthConnections).length === 0) return draft;

  const currentConnections = [...(draft.account?.connections || EMPTY_DRAFT.account.connections)];
  for (const [platform, data] of Object.entries(oauthConnections)) {
    if (platform === "google_search") {
      if (data.searchConsoleSiteUrl) {
        const idx = currentConnections.findIndex((c) => c.platform === "google_search_console");
        const conn: SocialConnection = {
          platform: "google_search_console",
          handle: data.searchConsoleSiteUrl,
          displayName: data.searchConsoleSiteUrl,
          status: "connected",
          connectionType: "oauth",
          providerLabel: "Google Search Console",
          propertyId: data.searchConsoleSiteUrl,
          connectedAt: data.connectedAt || new Date().toISOString(),
        };
        if (idx >= 0) currentConnections[idx] = conn;
        else currentConnections.push(conn);
      }
      if (data.ga4PropertyId) {
        const idx = currentConnections.findIndex((c) => c.platform === "google_analytics");
        const conn: SocialConnection = {
          platform: "google_analytics",
          handle: data.ga4PropertyId,
          displayName: data.ga4PropertyDisplayName || `GA4: ${data.ga4PropertyId}`,
          status: "connected",
          connectionType: "oauth",
          providerLabel: "Google Analytics",
          propertyId: data.ga4PropertyId,
          propertyDisplayName: data.ga4PropertyDisplayName || undefined,
          connectedAt: data.connectedAt || new Date().toISOString(),
        };
        if (idx >= 0) currentConnections[idx] = conn;
        else currentConnections.push(conn);
      }
      continue;
    }
    const key = (platform === "google" ? "google_business" : platform) as SocialPlatformKey;
    if (!V1_CONNECTORS.includes(key as V1SocialPlatformKey)) continue;
    const idx = currentConnections.findIndex((c) => c.platform === key);
    const conn: SocialConnection = {
      platform: key,
      handle: data.username || undefined,
      displayName: data.displayName || data.username || key,
      status: "connected",
      connectionType: "oauth",
      providerAccountId: data.providerAccountId,
      providerDisplayName: data.displayName || undefined,
      providerLabel: data.providerLabel || PROVIDER_LABELS[key] || "OAuth",
      connectedAt: data.connectedAt || new Date().toISOString(),
    };
    if (idx >= 0) {
      currentConnections[idx] = conn;
    } else {
      currentConnections.push(conn);
    }
  }

  const confirmedSocials = currentConnections
    .filter((c) => c.status === "connected")
    .map((c) => ({
      platform: c.platform,
      url: c.url || `https://${c.platform}.com/${c.handle?.replace(/^@/, "")}`,
      handle: c.handle || c.displayName || "",
      confirmed: c.connectionType === "oauth",
    }));

  return {
    ...draft,
    account: {
      ...draft.account,
      connections: currentConnections,
      googleSearch: oauthConnections.google_search || draft.account?.googleSearch,
    },
    business: { ...draft.business, socials: confirmedSocials },
  };
}

export function OnboardingWizard({ isStaff = false }: { isStaff?: boolean }) {
  const router = useRouter();
  // Captured once, synchronously, for the async ownership check below --
  // never applied to state directly. Applying it here (as this used to)
  // would render a possibly-different-user's business name/industry/
  // location before this component has any idea who is actually
  // authenticated -- see loadDraft()'s doc comment.
  const initial = useRef(loadDraft());
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  // A ref, not state: read by event-listener closures (the OAuth
  // postMessage handler below) that are attached once on mount and would
  // otherwise always see the stale (null) value from that first render.
  const ownerUserIdRef = useRef<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [autoSave, setAutoSave] = useState<"saved" | "saving" | "failed">("saved");
  const [stepError, setStepError] = useState<string | null>(null);
  const [businessErrors, setBusinessErrors] = useState<{ name?: string }>({});
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("idle");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [launchState, setLaunchState] = useState<"idle" | "launching" | "success">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Handle OAuth popup/redirect return — reopen the connector sheet on the
  // step where it lives (Brand) instead of the old dedicated Connectors step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    const provider = params.get("provider") || params.get("connected");

    if (window.opener && window.opener !== window) {
      if (oauthStatus === "success" || params.get("connected")) {
        try {
          window.opener.postMessage({ type: "STRATXCEL_OAUTH_SUCCESS", provider }, window.location.origin);
          window.close();
          return;
        } catch {
          // Fallback to in-page rendering
        }
      }
    }

    if (params.get("connected") || params.get("connect_error") || oauthStatus) {
      setStep(3);
      setConnectorOpen(true);
    }
  }, []);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === "STRATXCEL_OAUTH_SUCCESS") {
        void rehydrateFromServer();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function rehydrateFromServer() {
    try {
      const res = await fetch("/api/platform/onboarding", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as {
          saved?: { step?: number; draft?: Partial<OnboardingDraft> } | null;
          oauthConnections?: Record<string, any>;
        };
        setDraft((prevDraft) => {
          let merged = body.saved?.draft ? mergeDraft(body.saved.draft) : prevDraft;
          if (body.oauthConnections) merged = mergeOAuthConnectionsIntoDraft(merged, body.oauthConnections);
          persistDraft(step, merged, ownerUserIdRef.current);
          return merged;
        });
      }
    } catch {
      // Non-blocking trace
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  useEffect(() => {
    // `initial.current` was captured synchronously at mount, before this
    // component had any idea who is authenticated -- it must never be
    // applied to state until validated against the real user below.
    const clientDraft = initial.current;
    let cancelled = false;
    async function loadAccount() {
      try {
        const supabase = createSupabaseBrowserClient();
        const [authResult, draftResponse] = await Promise.all([
          supabase.auth.getUser().catch(() => ({ data: { user: null } })),
          fetch("/api/platform/onboarding", { cache: "no-store" }).catch(() => null),
        ]);
        const user = authResult.data?.user;
        if (cancelled) return;
        if (user) {
          ownerUserIdRef.current = user.id;
          // The one real fix: a client-side draft is only ever trusted as
          // this user's own when it was stamped with this exact user id by
          // a previous visit from the same authenticated session. A draft
          // saved by a different (or no) user in this same browser tab is
          // never applied -- closes the cross-account onboarding-form leak
          // traced in docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md.
          const clientDraftOwnedByThisUser = clientDraft.ownerUserId === user.id;
          const clientDraftHasContent =
            clientDraft.step > 0 || Boolean(clientDraft.draft.business.name) || Boolean(clientDraft.draft.business.website);
          if (draftResponse && draftResponse.ok) {
            const body = (await draftResponse.json()) as {
              saved?: { step?: number; draft?: Partial<OnboardingDraft> } | null;
              oauthConnections?: Record<string, any>;
              googleSearch?: any;
            };
            if (body.saved?.draft || body.oauthConnections || body.googleSearch || (clientDraftOwnedByThisUser && clientDraftHasContent)) {
              const combinedOauth = {
                ...(body.oauthConnections || {}),
                ...(body.googleSearch ? { google_search: body.googleSearch } : {}),
              };
              const baseDraft = body.saved?.draft
                ? mergeDraft(body.saved.draft)
                : clientDraftOwnedByThisUser
                  ? clientDraft.draft
                  : EMPTY_DRAFT;
              const merged = mergeOAuthConnectionsIntoDraft(baseDraft, combinedOauth);

              const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
              const hasOAuthReturn = urlParams?.get("connected") || urlParams?.get("oauth") || urlParams?.get("googleConnected");
              const fallbackStep = clientDraftOwnedByThisUser ? clientDraft.step : 0;
              const nextStep = hasOAuthReturn ? 3 : Math.min(Math.max(body.saved?.step ?? fallbackStep, 0), TOTAL_STEPS - 1);

              setStep(nextStep);
              setDraft(merged);
            }
          }
          setAccountName((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? null);
        }
      } catch {
        // Fallback gracefully on unauthenticated or network error
      } finally {
        if (!cancelled) setDraftHydrated(true);
      }
      trackFunnel("onboarding_started", { surface: "app" });
    }
    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !draftHydrated) return;
    persistDraft(step, draft, ownerUserIdRef.current);
    setAutoSave("saving");
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/platform/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, draft }),
        });
        setAutoSave(response.ok ? "saved" : "failed");
      } catch {
        setAutoSave("failed");
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [step, draft, draftHydrated]);

  function applySynthesizedIntelligence(intel: any) {
    if (!intel) return;
    setDraft((d) => {
      const nextBusiness = {
        ...d.business,
        name: d.business.name || intel.business?.name || d.business.name,
        industry: d.business.industry || intel.business?.industry || d.business.industry,
        businessModel: intel.business?.businessModel || d.business.businessModel,
        location: d.business.location || intel.business?.location || d.business.location,
        whatsapp: d.business.whatsapp || intel.business?.whatsapp || d.business.whatsapp,
        services: intel.business?.services?.length ? intel.business.services : d.business.services,
        primaryOffer: intel.business?.primaryOffer || d.business.primaryOffer,
        stage: intel.business?.stage || d.business.stage,
      };
      // intel.goals.recommendedKeys comes from the industry-preset intelligence
      // module (lib/intelligence/onboarding-business-intelligence.ts), whose
      // vocabulary (thirty_day_growth_plan, seo_audit, website_landing_page, …)
      // is a set of audit/deliverable module identifiers — a different
      // taxonomy from StepGoals' own BUSINESS_GOALS checkbox keys
      // (google_visibility, whatsapp_leads, social_presence, …). Writing the
      // raw preset keys into draft.goals silently added goals the user never
      // saw or could deselect in StepGoals' UI, and they'd resurface as
      // meaningless Title-Cased text at Review. Only keys StepGoals actually
      // renders can populate goals/recommendedGoals here.
      const rawRecommendedKeys = Array.isArray(intel.goals?.recommendedKeys) ? intel.goals.recommendedKeys : [];
      const recommendedKeys = rawRecommendedKeys.filter((key: string) => STEP_GOALS_KEYS.has(key));
      const nextGoals = d.goals.length > 0 ? d.goals : recommendedKeys.slice(0, 3);
      return { ...d, business: nextBusiness, goals: nextGoals, recommendedGoals: recommendedKeys };
    });
  }

  async function startDiscovery(websiteInput: string, gbpInput: string) {
    let cleanWebsite = (websiteInput || "").trim();
    if (cleanWebsite) {
      const norm = normalizeWebsiteUrl(cleanWebsite);
      if (norm.ok && norm.url) cleanWebsite = norm.url;
    }
    let cleanGbp = (gbpInput || "").trim();
    if (cleanGbp) {
      const norm = validateAndNormalizeGoogleMapsInput(cleanGbp);
      if (norm.success) cleanGbp = norm.data.canonicalUrl;
    }
    if (!cleanWebsite && !cleanGbp) return;

    setDiscoveryState("running");
    setDiscoveryError(null);
    try {
      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: cleanWebsite || undefined,
          googleMapsUrl: cleanGbp || undefined,
          industry: draft.business.industry || undefined,
          existingDraft: { businessName: draft.business.name, location: draft.business.location },
        }),
      });
      if (!res.ok) {
        setDiscoveryState("failed");
        return;
      }
      const data = await res.json();
      if (data.intelligence) {
        applySynthesizedIntelligence(data.intelligence);
        setDiscoveryState("done");
      } else {
        setDiscoveryState("failed");
      }
    } catch {
      setDiscoveryError("Network error — please try again.");
      setDiscoveryState("failed");
    }
  }

  function updateConnections(connections: SocialConnection[]) {
    setDraft((d) => ({
      ...d,
      account: { ...d.account, connections },
      business: {
        ...d.business,
        socials: connections
          .filter((c) => c.status === "connected")
          .map((c) => ({
            platform: c.platform,
            url: c.url || `https://${c.platform}.com/${c.handle?.replace(/^@/, "")}`,
            handle: c.handle || c.displayName || "",
            confirmed: c.connectionType === "oauth",
          })),
      },
    }));
  }

  function updateBusiness(patch: Partial<OnboardingDraft["business"]>) {
    setDraft((d) => ({ ...d, business: { ...d.business, ...patch } }));
  }

  function updateBrand(patch: Partial<OnboardingDraft["brand"]>) {
    setDraft((d) => ({ ...d, brand: { ...d.brand, ...patch } }));
  }

  function toggleGoal(key: string) {
    setDraft((d) => ({ ...d, goals: d.goals.includes(key) ? d.goals.filter((g) => g !== key) : [...d.goals, key] }));
  }

  function handleContinue() {
    setStepError(null);
    setBusinessErrors({});
    if (step === 1 && !draft.business.name.trim()) {
      setBusinessErrors({ name: "Please enter your business name" });
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }

  function handleBack() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function launch() {
    if (launchState === "launching") return;
    setLaunchState("launching");
    setSubmitError(null);

    const generatedSlug = slugify(draft.business.name) || "workspace";
    const confirmedSocials = (draft.account?.connections || [])
      .filter((c) => c.status === "connected")
      .map((c) => ({
        platform: c.platform,
        url: c.url || `https://${c.platform}.com/${c.handle?.replace(/^@/, "")}`,
        handle: c.handle || c.displayName || "",
        confirmed: c.connectionType === "oauth",
        connectionType: c.connectionType || "manual",
        providerAccountId: c.providerAccountId,
      }));

    try {
      const res = await fetch("/api/platform/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            name: draft.business.name.trim(),
            slug: generatedSlug,
            industry: draft.business.industry.trim() || undefined,
            website: draft.business.website?.trim() || undefined,
            googleMapsUrl: draft.business.googleMapsUrl?.trim() || undefined,
            location: draft.business.location?.trim() || undefined,
            businessModel: draft.business.businessModel?.trim() || undefined,
            socials: confirmedSocials,
          },
          brand: {
            businessName: draft.business.name.trim() || undefined,
            description: draft.brand.description.trim() || undefined,
            audience: draft.brand.audience.trim() || undefined,
            tone: draft.brand.tone.trim() || undefined,
            offers: draft.brand.offers.split("\n").map((l) => l.trim()).filter(Boolean),
            restrictions: draft.brand.restrictions.split("\n").map((l) => l.trim()).filter(Boolean),
          },
          goals: draft.goals,
          plan: null,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setLaunchState("idle");
        if (res.status === 401) {
          setSubmitError("Your session expired — sign in again to continue.");
          return;
        }
        setSubmitError(body.error ?? `Couldn't create your workspace (HTTP ${res.status}). Try again.`);
        return;
      }

      const tenant = body.tenant as { id: string };
      trackFunnel("business_profile_completed", { surface: "onboarding" });
      await setActiveTenantAction(tenant.id);
      if (typeof window !== "undefined") window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      setLaunchState("success");
    } catch {
      setLaunchState("idle");
      setSubmitError("Network error — check your connection and try again.");
    }
  }

  function goToDashboard() {
    router.push("/app/audit");
    router.refresh();
  }

  const currentStepName = ONBOARDING_STEP_LABELS[step];
  const progressPercent = step === 0 ? 0 : Math.round((step / (TOTAL_STEPS - 1)) * 100);

  if (launchState === "success") {
    return (
      <div className="sx-customer-app flex min-h-screen items-center justify-center bg-sx-bg p-8">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-sx-success/10">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
          </span>
          <h1 className="mt-6 text-2xl font-bold text-sx-text">You&rsquo;re all set{accountName ? `, ${accountName}` : ""}!</h1>
          <p className="mt-2.5 max-w-[280px] text-sm leading-relaxed text-sx-text-muted">
            StratXcel is scanning your business online and preparing your free growth audit. This usually takes about 30 seconds.
          </p>
          <div className="mt-7 flex w-full flex-col gap-2.5 rounded-sx-lg bg-sx-surface-2 p-4 text-left">
            {["Scanning Google Business Profile…", "Checking nearby competitors", "Building your health score"].map((line) => (
              <div key={line} className="flex items-center gap-2.5">
                <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-sx-accent sx-status-pulse" />
                <p className="text-sm font-medium text-sx-text">{line}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={goToDashboard}
            className="mt-6 flex h-[52px] w-full items-center justify-center rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
          >
            Go to my dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sx-customer-app mx-auto flex min-h-screen w-full max-w-full flex-col sm:max-w-2xl lg:max-w-3xl">
      {isStaff && (
        <div className="flex items-center justify-between rounded-sx-md border border-sx-accent/30 bg-sx-accent/10 px-3.5 py-2 text-xs mx-4 mt-4">
          <span className="font-medium text-sx-text">🛡 Testing Customer Onboarding (Staff Account)</span>
          <ContextSwitcher currentContext="user" compact />
        </div>
      )}

      {/* Progress bar — hidden on Welcome */}
      {step > 0 && (
        <div className="shrink-0 border-b border-sx-border bg-sx-surface-1 px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="max-w-[200px] truncate text-xs font-medium text-sx-text-subtle">
              Step {step} of {TOTAL_STEPS - 1} · {currentStepName}
            </p>
            <p role="status" className={`shrink-0 text-[11px] font-semibold ${autoSave === "saved" ? "text-sx-success" : autoSave === "failed" ? "text-sx-danger" : "text-sx-text-subtle"}`}>
              {autoSave === "saved" ? "Saved ✓" : autoSave === "saving" ? "Saving…" : "Save failed"}
            </p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-sx-border">
            <div className="h-full rounded-full bg-sx-accent transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-6 sm:px-6">
        {stepError && <p className="mb-3 text-sm text-sx-danger">{stepError}</p>}

        {!draftHydrated && step === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-sx-accent border-t-transparent" />
          </div>
        ) : (
          <>
            {step === 0 && <StepWelcome onGetStarted={() => setStep(1)} />}
            {step === 1 && (
              <StepBusiness
                draft={draft}
                update={updateBusiness}
                errors={businessErrors}
                discoveryState={discoveryState}
                onStartDiscovery={(w, g) => void startDiscovery(w, g)}
                onResetDiscovery={() => setDiscoveryState("idle")}
                errorField={discoveryError}
              />
            )}
            {step === 2 && <StepGoals draft={draft} selected={draft.goals} onToggle={toggleGoal} />}
            {step === 3 && <StepBrand draft={draft} update={updateBrand} onOpenConnector={() => setConnectorOpen(true)} />}
            {step === 4 && (
              <StepReview
                draft={draft}
                error={submitError}
                onEditDetails={() => setStep(1)}
                onOpenConnector={() => setConnectorOpen(true)}
              />
            )}
          </>
        )}
      </div>

      {/* Footer — hidden on Welcome (its CTA is inline in StepWelcome) */}
      {step > 0 && (
        <div className="shrink-0 border-t border-sx-border bg-sx-surface-1 px-4 py-3">
          {step === 1 && (
            <button
              type="button"
              onClick={handleContinue}
              className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
            >
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          )}
          {(step === 2 || step === 3) && (
            <div className="flex gap-2.5">
              <button type="button" onClick={handleBack} className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                onClick={handleContinue}
                className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
              >
                Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
          {step === 4 && (
            <div className="flex gap-2.5">
              <button type="button" onClick={handleBack} disabled={launchState === "launching"} className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border disabled:opacity-50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                onClick={() => void launch()}
                disabled={launchState === "launching"}
                className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[15px] font-bold uppercase tracking-wide text-sx-accent-on disabled:opacity-70"
              >
                {launchState === "launching" ? "Setting up your workspace…" : "Get my free audit"}
                {launchState !== "launching" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {connectorOpen && (
        <ConnectorSheet
          connections={draft.account?.connections || []}
          onConnectionsChange={updateConnections}
          onClose={() => setConnectorOpen(false)}
        />
      )}
    </div>
  );
}
