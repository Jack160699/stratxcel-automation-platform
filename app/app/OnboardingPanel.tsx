"use client";

import { useRouter } from "next/navigation";
import { CreateClientForm } from "@/components/forms/CreateClientForm";
import { setActiveTenantAction } from "./tenant-actions";

/**
 * Shown in place of the Command Center when a signed-in client has zero
 * tenant memberships — the honest, functional placeholder for the full
 * 6-step onboarding flow specced in
 * docs/product-design/AUTH_AND_ONBOARDING_FLOW.md §3 (Account → Business →
 * Goals → Brand → Plan → Workspace). That full flow is not built in this
 * pass; this reuses the same real, working createTenant() path
 * app/admin/(shell)/OnboardingPanel.tsx already uses (same
 * POST /api/platform/tenants, same CreateClientForm) so a brand-new signup
 * can genuinely reach a working workspace today, not a dead end — the
 * richer multi-step experience is later, separately-scoped work.
 */
export function OnboardingPanel() {
  const router = useRouter();

  async function handleCreated(tenant: { id: string }) {
    await setActiveTenantAction(tenant.id);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Welcome to Stratxcel</h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Create your workspace to get started — missions, Copilot, approvals, and everything else are scoped to it.
        </p>
      </div>
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6">
        <CreateClientForm onCreated={handleCreated} />
      </div>
    </div>
  );
}
