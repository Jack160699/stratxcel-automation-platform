"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { setActiveTenantAction } from "../tenant-actions";
import { StepAccount, type AccountInfo } from "./steps/StepAccount";
import { StepConnectors } from "./steps/StepConnectors";
import { StepBusiness } from "./steps/StepBusiness";
import { StepGoals } from "./steps/StepGoals";
import { StepReview } from "./steps/StepReview";
import {
  EMPTY_DRAFT,
  ONBOARDING_DRAFT_KEY,
  ONBOARDING_STEP_LABELS,
  slugify,
  type OnboardingDraft,
  type SocialConnection,
} from "./types";
import { trackFunnel } from "@/lib/analytics/events";
import { normalizeWebsiteUrl } from "@/lib/identity/smart-url";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";

const TOTAL_STEPS = ONBOARDING_STEP_LABELS.length;

function loadDraft(): { step: number; draft: OnboardingDraft } {
  if (typeof window === "undefined") return { step: 1, draft: EMPTY_DRAFT };
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return { step: 1, draft: EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as { step: number; draft: OnboardingDraft };
    if (!parsed?.draft) return { step: 1, draft: EMPTY_DRAFT };
    return {
      step: Math.min(Math.max(parsed.step ?? 1, 1), TOTAL_STEPS),
      draft: {
        ...EMPTY_DRAFT,
        ...parsed.draft,
        account: {
          ...EMPTY_DRAFT.account,
          ...parsed.draft.account,
          connections: parsed.draft.account?.connections || EMPTY_DRAFT.account.connections,
        },
      },
    };
  } catch {
    return { step: 1, draft: EMPTY_DRAFT };
  }
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

export function OnboardingWizard() {
  const router = useRouter();
  const initial = useRef(loadDraft());
  const [step, setStep] = useState(initial.current.step);
  const [draft, setDraft] = useState<OnboardingDraft>(initial.current.draft);
  const [account, setAccount] = useState<AccountInfo>({
    displayName: "StratXcel Account",
    email: "hello@stratxcel.com",
    emailVerified: true,
  });
  const [accountLoading, setAccountLoading] = useState(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [businessErrors, setBusinessErrors] = useState<{ name?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // If user returned from OAuth callback, stay on or jump to Step 2 (Connectors)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") || params.get("connect_error")) {
      setStep(2);
    }
  }, []);

  useEffect(() => {
    const clientDraft = loadDraft();
    if (clientDraft.step > 1 || clientDraft.draft.business.name || clientDraft.draft.business.website) {
      setStep(clientDraft.step);
      setDraft(clientDraft.draft);
    }
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
          if (draftResponse && draftResponse.ok) {
            const body = (await draftResponse.json()) as { saved?: { step?: number; draft?: Partial<OnboardingDraft> } | null };
            if (body.saved?.draft) {
              setStep(Math.min(Math.max(body.saved.step ?? 1, 1), TOTAL_STEPS));
              setDraft(mergeDraft(body.saved.draft));
            }
          }
          setAccount({
            displayName: (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "User",
            email: user.email ?? null,
            emailVerified: Boolean(user.email_confirmed_at),
          });
          setDraftHydrated(true);
        }
      } catch {
        // Fallback gracefully on unauthenticated or network error
      } finally {
        if (!cancelled) setAccountLoading(false);
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
    window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step, draft }));
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/platform/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, draft }),
        });
        setDraftSaveError(response.ok ? null : "Progress could not be saved. Keep this page open and retry.");
      } catch {
        setDraftSaveError("Progress could not be saved. Keep this page open and retry.");
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

      const nextBrand = {
        ...d.brand,
        businessName: d.brand.businessName || intel.brand?.businessName || nextBusiness.name,
        description: d.brand.description || intel.brand?.description || "",
        audience: d.brand.audience || intel.brand?.audience || "",
        tone: d.brand.tone || intel.brand?.tone || "",
        offers: d.brand.offers || intel.brand?.offers || "",
        restrictions: d.brand.restrictions || intel.brand?.restrictions || "",
      };

      const recommendedKeys = Array.isArray(intel.goals?.recommendedKeys) ? intel.goals.recommendedKeys : [];
      const nextGoals = d.goals.length > 0 ? d.goals : recommendedKeys.slice(0, 3);

      return {
        ...d,
        business: nextBusiness,
        brand: nextBrand,
        goals: nextGoals,
        recommendedGoals: recommendedKeys,
      };
    });
  }

  async function triggerDiscoverySynthesis(websiteInput?: string, gbpInput?: string) {
    const rawWebsite = websiteInput || draft.business.website || "";
    const rawGbp = gbpInput || draft.business.googleMapsUrl || "";
    if (!rawWebsite && !rawGbp) return;

    let cleanWebsite = rawWebsite.trim();
    if (cleanWebsite) {
      const norm = normalizeWebsiteUrl(cleanWebsite);
      if (norm.ok && norm.url) cleanWebsite = norm.url;
    }

    let cleanGbp = rawGbp.trim();
    if (cleanGbp) {
      const norm = validateAndNormalizeGoogleMapsInput(cleanGbp);
      if (norm.success) cleanGbp = norm.data.canonicalUrl;
    }

    setIsSynthesizing(true);
    try {
      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: cleanWebsite || undefined,
          googleMapsUrl: cleanGbp || undefined,
          industry: draft.business.industry || undefined,
          existingDraft: {
            businessName: draft.business.name,
            location: draft.business.location,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.intelligence) {
          applySynthesizedIntelligence(data.intelligence);
        }
      }
    } catch {
      // Non-blocking background intelligence trace
    } finally {
      setIsSynthesizing(false);
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

  function toggleGoal(key: string) {
    setDraft((d) => ({
      ...d,
      goals: d.goals.includes(key) ? d.goals.filter((g) => g !== key) : [...d.goals, key],
    }));
  }

  function validateCurrentStep(): boolean {
    setStepError(null);
    setBusinessErrors({});
    if (step === 1) {
      if (!account.displayName.trim()) {
        setStepError("Enter your name to continue.");
        return false;
      }
    }
    if (step === 3) {
      if (!draft.business.name.trim()) {
        setBusinessErrors({ name: "Business name is required." });
        return false;
      }
    }
    return true;
  }

  function handleContinue() {
    if (!validateCurrentStep()) return;

    // When advancing from Step 1 (Account), trigger background intelligence synthesis
    if (step === 1) {
      let normalizedWebsite = draft.business.website.trim();
      if (normalizedWebsite) {
        const norm = normalizeWebsiteUrl(normalizedWebsite);
        if (norm.ok && norm.url) {
          normalizedWebsite = norm.url;
          updateBusiness({ website: norm.url });
        }
      }

      let normalizedGbp = (draft.business.googleMapsUrl ?? "").trim();
      if (normalizedGbp) {
        const norm = validateAndNormalizeGoogleMapsInput(normalizedGbp);
        if (norm.success) {
          normalizedGbp = norm.data.canonicalUrl;
          updateBusiness({
            googleMapsUrl: norm.data.canonicalUrl,
            name: !draft.business.name && norm.data.placeName ? norm.data.placeName : draft.business.name,
          });
        }
      }

      // Fire intelligence synthesis in background for Step 3 and Brand Brain
      void triggerDiscoverySynthesis(normalizedWebsite, normalizedGbp);
    }

    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setStepError(null);
    setBusinessErrors({});
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleCreateWorkspace() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const generatedSlug = slugify(draft.business.name) || "workspace";

    // Format confirmed social channels from account connections
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
            businessName: draft.brand.businessName.trim() || undefined,
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
      router.push("/app/audit");
      router.refresh();
    } catch {
      setSubmitError("Network error — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const currentStepName = ONBOARDING_STEP_LABELS[step - 1];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-full sm:max-w-2xl lg:max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-sx-sans text-xl sm:text-2xl font-bold text-sx-text">Welcome to StratXcel</h1>
        <p className="mt-1 font-sx-sans text-xs sm:text-sm text-sx-text-muted">Set up your business workspace and start your free audit.</p>
      </div>

      {/* Progress Indicator */}
      <div className="w-full">
        {/* Mobile-first compact step header */}
        <div className="flex items-center justify-between text-xs font-semibold text-sx-text-muted mb-2">
          <span className="uppercase tracking-wider text-sx-accent">
            Step {step} of {TOTAL_STEPS} · {currentStepName}
          </span>
          <span className="text-sx-text-subtle font-mono text-[11px]">
            {Math.round((step / TOTAL_STEPS) * 100)}%
          </span>
        </div>

        {/* Sleek Progress Bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-sx-surface-2">
          <div
            className="h-full bg-sx-accent transition-all duration-300 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step dots for quick visual orientation */}
        <div className="flex justify-between items-center mt-2 px-1">
          {ONBOARDING_STEP_LABELS.map((label, idx) => {
            const stepNum = idx + 1;
            const isDone = stepNum < step;
            const isCurrent = stepNum === step;
            return (
              <span
                key={label}
                className={`text-[10px] font-medium transition-colors ${
                  isCurrent ? "text-sx-text font-bold" : isDone ? "text-emerald-400" : "text-sx-text-subtle"
                }`}
              >
                {label}
              </span>
            );
          })}
        </div>

        <p className="mt-2 text-center text-xs text-sx-text-subtle" role="status">
          {draftSaveError ?? (draftHydrated ? "Progress saves to your account automatically." : "Loading saved progress…")}
        </p>
      </div>

      {/* Main Wizard Form Card */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < TOTAL_STEPS) handleContinue();
        }}
        className="flex flex-col gap-6 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 sm:p-7 shadow-sm w-full"
      >
        <div aria-live="polite">
          {stepError && <ErrorState message={stepError} />}
        </div>

        {accountLoading && step === 1 ? (
          <div className="py-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-sx-accent border-t-transparent" />
            <p className="mt-3 font-sx-sans text-xs text-sx-text-subtle">Loading your account…</p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <StepAccount
                account={account}
                draft={draft}
                onAccountChange={setAccount}
                onBusinessChange={updateBusiness}
              />
            )}
            {step === 2 && (
              <StepConnectors
                connections={draft.account?.connections || []}
                onConnectionsChange={updateConnections}
              />
            )}
            {step === 3 && (
              <StepBusiness
                draft={draft}
                update={updateBusiness}
                errors={businessErrors}
                isSynthesizing={isSynthesizing}
              />
            )}
            {step === 4 && <StepGoals draft={draft} selected={draft.goals} onToggle={toggleGoal} />}
            {step === 5 && (
              <StepReview
                account={account}
                draft={draft}
                submitting={submitting}
                error={submitError}
                onSubmit={handleCreateWorkspace}
              />
            )}
          </>
        )}

        {/* Action Buttons */}
        {step < TOTAL_STEPS && (
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-sx-border/60">
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={handleBack}
              disabled={step === 1}
              className="text-xs font-semibold"
            >
              Back
            </Button>
            <Button type="submit" variant="primary" size="touch" className="min-w-28 text-xs font-bold shadow-xs">
              {step === 2 && (draft.account?.connections || []).every((c) => c.status !== "connected")
                ? "Skip for now →"
                : "Continue →"}
            </Button>
          </div>
        )}
        {step === TOTAL_STEPS && (
          <div className="flex items-center justify-start pt-2">
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={handleBack}
              disabled={submitting}
              className="text-xs font-semibold"
            >
              ← Back to Edit
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
