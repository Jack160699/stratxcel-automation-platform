"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WorkflowRail, type RailStage } from "@/components/ui/WorkflowRail";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { setActiveTenantAction } from "../tenant-actions";
import { StepAccount, type AccountInfo } from "./steps/StepAccount";
import { StepBusiness } from "./steps/StepBusiness";
import { StepGoals } from "./steps/StepGoals";
import { StepBrand } from "./steps/StepBrand";
import { StepReview } from "./steps/StepReview";
import { EMPTY_DRAFT, ONBOARDING_DRAFT_KEY, ONBOARDING_STEP_LABELS, type OnboardingDraft } from "./types";
import { trackFunnel } from "@/lib/analytics/events";

const TOTAL_STEPS = ONBOARDING_STEP_LABELS.length;

function loadDraft(): { step: number; draft: OnboardingDraft } {
  if (typeof window === "undefined") return { step: 1, draft: EMPTY_DRAFT };
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return { step: 1, draft: EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as { step: number; draft: OnboardingDraft };
    if (!parsed?.draft) return { step: 1, draft: EMPTY_DRAFT };
    return { step: Math.min(Math.max(parsed.step ?? 1, 1), TOTAL_STEPS), draft: { ...EMPTY_DRAFT, ...parsed.draft } };
  } catch {
    return { step: 1, draft: EMPTY_DRAFT };
  }
}

function mergeDraft(value: Partial<OnboardingDraft> | undefined): OnboardingDraft {
  return {
    ...EMPTY_DRAFT,
    ...value,
    business: { ...EMPTY_DRAFT.business, ...value?.business },
    brand: { ...EMPTY_DRAFT.brand, ...value?.brand },
    plan: { ...EMPTY_DRAFT.plan, ...value?.plan },
    goals: Array.isArray(value?.goals) ? value.goals : [],
  };
}

/**
 * Six-stage onboarding wizard — one URL, step tracked in local state per
 * docs/product-design/AUTH_AND_ONBOARDING_FLOW.md §3. Non-secret draft fields
 * are saved through the authenticated onboarding API, with sessionStorage as
 * an immediate same-tab fallback. The final step creates the workspace.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const initial = useRef(loadDraft());
  const [step, setStep] = useState(initial.current.step);
  const [draft, setDraft] = useState<OnboardingDraft>(initial.current.draft);
  const [account, setAccount] = useState<AccountInfo>({ displayName: "StratXcel Account", email: "hello@stratxcel.com", emailVerified: true });
  const [accountLoading, setAccountLoading] = useState(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [businessErrors, setBusinessErrors] = useState<{ name?: string; slug?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const clientDraft = loadDraft();
    if (clientDraft.step > 1 || clientDraft.draft.business.name || (clientDraft.draft.business.socials && clientDraft.draft.business.socials.length > 0)) {
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
        name: d.business.name && d.business.slugTouched ? d.business.name : (intel.business?.name || d.business.name),
        slug: d.business.slug && d.business.slugTouched ? d.business.slug : (intel.business?.slug || d.business.slug),
        industry: d.business.industry || intel.business?.industry || d.business.industry,
        businessModel: intel.business?.businessModel || d.business.businessModel,
        location: d.business.location || intel.business?.location || d.business.location,
        whatsapp: d.business.whatsapp || intel.business?.whatsapp || d.business.whatsapp,
        services: intel.business?.services?.length ? intel.business.services : d.business.services,
        primaryOffer: intel.business?.primaryOffer || d.business.primaryOffer,
        stage: intel.business?.stage || d.business.stage,
        socials: intel.business?.socials?.length ? intel.business.socials : d.business.socials,
        intelligenceProvenance: intel.provenance || d.business.intelligenceProvenance,
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

  function updateBusiness(patch: Partial<OnboardingDraft["business"]>) {
    setDraft((d) => ({ ...d, business: { ...d.business, ...patch } }));
  }
  function updateBrand(patch: Partial<OnboardingDraft["brand"]>) {
    setDraft((d) => ({ ...d, brand: { ...d.brand, ...patch } }));
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
    if (step === 2) {
      const errs: { name?: string; slug?: string } = {};
      if (!draft.business.name.trim()) errs.name = "Business name is required.";
      if (!draft.business.slug.trim()) errs.slug = "Workspace slug is required.";
      else if (!/^[a-z0-9-]+$/.test(draft.business.slug)) errs.slug = "Slug must be lowercase letters, numbers, and hyphens only.";
      if (Object.keys(errs).length) {
        setBusinessErrors(errs);
        return false;
      }
    }
    return true;
  }

  function handleContinue() {
    if (!validateCurrentStep()) return;
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

    try {
      const res = await fetch("/api/platform/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: { name: draft.business.name.trim(), slug: draft.business.slug.trim(), industry: draft.business.industry.trim() || undefined },
          brand: {
            businessName: draft.brand.businessName.trim() || undefined,
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
        if (res.status === 409) {
          setStep(2);
          setBusinessErrors({ slug: body.error ?? "That slug is already taken." });
          setSubmitError(null);
          return;
        }
        if (res.status === 401) {
          setSubmitError("Your session expired — sign in again to continue.");
          return;
        }
        setSubmitError(body.error ?? `Couldn't create your workspace (HTTP ${res.status}). Try again.`);
        return;
      }

      const tenant = body.tenant as { id: string };
      trackFunnel("business_profile_completed", {
        surface: "onboarding",
      });
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

  const stages: RailStage[] = ONBOARDING_STEP_LABELS.map((label, i) => ({
    label,
    status: i + 1 < step ? "done" : i + 1 === step ? "active" : "future",
  }));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="text-center">
        <h1 className="font-sx-sans text-xl sm:text-2xl font-semibold text-sx-text">Welcome to Stratxcel</h1>
        <p className="mt-2 font-sx-sans text-sm text-sx-text-muted">Let&rsquo;s set up your workspace.</p>
      </div>

      <div className="w-full">
        <WorkflowRail stages={stages} />
        <p className="sr-only" role="status">
          Step {step} of {TOTAL_STEPS}: {ONBOARDING_STEP_LABELS[step - 1]}
        </p>
        <p className="mt-2 text-center text-xs text-sx-text-subtle" role="status">
          {draftSaveError ?? (draftHydrated ? "Progress saves to your account." : "Loading saved progress…")}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < TOTAL_STEPS) handleContinue();
        }}
        className="flex flex-col gap-6 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-7 lg:p-8 w-full shadow-sm"
      >
        <h2 className="font-sx-sans text-[15px] font-semibold text-sx-text">{ONBOARDING_STEP_LABELS[step - 1]}</h2>

        <div aria-live="polite">
          {stepError && <ErrorState message={stepError} />}
        </div>

        {accountLoading && step === 1 ? (
          <p className="font-sx-sans text-sm text-sx-text-subtle">Loading your account…</p>
        ) : (
          <>
            {step === 1 && <StepAccount account={account} onAccountChange={setAccount} />}
            {step === 2 && (
              <StepBusiness
                draft={draft}
                update={updateBusiness}
                errors={businessErrors}
                onIntelligenceSynthesized={applySynthesizedIntelligence}
              />
            )}
            {step === 3 && <StepGoals draft={draft} selected={draft.goals} onToggle={toggleGoal} />}
            {step === 4 && <StepBrand draft={draft} update={updateBrand} />}
            {step === 5 && (
              <StepReview account={account} draft={draft} submitting={submitting} error={submitError} onSubmit={handleCreateWorkspace} />
            )}
          </>
        )}

        {step < TOTAL_STEPS && (
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="touch" onClick={handleBack} disabled={step === 1}>
              Back
            </Button>
            <Button type="submit" variant="primary" size="touch">
              Continue
            </Button>
          </div>
        )}
        {step === TOTAL_STEPS && (
          <div className="flex items-center justify-start">
            <Button type="button" variant="ghost" size="touch" onClick={handleBack} disabled={submitting}>
              Back
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
