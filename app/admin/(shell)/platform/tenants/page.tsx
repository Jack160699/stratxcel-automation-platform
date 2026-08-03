"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { CreateClientForm } from "../../CreateClientForm";

interface Membership {
  tenant_id: string;
  role: string;
  tenant: { id: string; slug: string; name: string };
}

export default function TenantsPage() {
  const router = useRouter();
  const { active, switchTenant } = useCurrentTenant();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMemberships() {
    setError(null);
    const res = await fetch("/api/platform/tenants");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed to load tenants (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { memberships: Membership[] };
    setMemberships(body.memberships);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMemberships();
  }, []);

  async function handleCreated(tenant: { id: string }) {
    await loadMemberships();
    await switchTenant(tenant.id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Clients</h1>
        <p className="mt-1 text-sm text-slate-400">Every client (tenant) you belong to, and where to add another.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-base font-medium text-slate-200">Create a client</h2>
        <CreateClientForm onCreated={handleCreated} compact />
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Your clients</h2>
        {memberships === null && <p className="text-sm text-slate-500">Loading…</p>}
        {memberships?.length === 0 && <p className="text-sm text-slate-500">No clients yet — create one above.</p>}
        {memberships && memberships.length > 0 && (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => {
              const isActive = active?.tenantId === m.tenant_id;
              return (
                <li
                  key={m.tenant_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                >
                  <div>
                    <p className="font-medium text-slate-200">{m.tenant.name}</p>
                    <p className="text-xs text-slate-500">
                      {m.tenant.slug} · role: {m.role}
                    </p>
                  </div>
                  <button
                    onClick={() => switchTenant(m.tenant_id)}
                    disabled={isActive}
                    className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-medium ${
                      isActive ? "bg-emerald-400/20 text-emerald-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {isActive ? "Active" : "Use this client"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
