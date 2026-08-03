"use client";

import { useRouter } from "next/navigation";
import { CreateClientForm } from "./CreateClientForm";
import { setActiveTenantAction } from "./tenant-actions";

/**
 * Shown by CommandCenterPage in place of the normal dashboard when the
 * signed-in owner has zero tenant memberships. After creation, the new
 * tenant is selected via the same server action the switcher uses (never
 * assumed client-side) and the whole shell is refreshed so the layout
 * re-resolves membership and the switcher/nav pick up the new client.
 */
export function OnboardingPanel() {
  const router = useRouter();

  async function handleCreated(tenant: { id: string }) {
    await setActiveTenantAction(tenant.id);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-100">Welcome to StratExcel AI</h1>
        <p className="mt-2 text-sm text-slate-400">
          Create your first client to unlock the Command Center — missions, approvals, content, and everything else
          are scoped to a client.
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <CreateClientForm onCreated={handleCreated} />
      </div>
    </div>
  );
}
