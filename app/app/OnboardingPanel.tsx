"use client";

import { OnboardingWizard } from "./onboarding/OnboardingWizard";

/**
 * Shown in place of the Command Center when a signed-in client has zero
 * tenant memberships. Structured six-stage wizard (Account → Business →
 * Goals → Brand → Plan → Review) per
 * docs/product-design/AUTH_AND_ONBOARDING_FLOW.md §3 — see
 * app/app/onboarding/OnboardingWizard.tsx for the flow itself and
 * app/api/platform/onboarding/route.ts for the single secure write step
 * (tenant creation + Brand Brain seed + audit log), which still reuses the
 * same createTenant()/Brand Brain repository the rest of the platform uses.
 */
export function OnboardingPanel({ isStaff = false }: { isStaff?: boolean }) {
  return <OnboardingWizard isStaff={isStaff} />;
}
