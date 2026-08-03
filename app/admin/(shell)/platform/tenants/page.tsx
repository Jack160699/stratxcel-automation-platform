"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { CreateClientForm } from "@/components/forms/CreateClientForm";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";

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
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Clients</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every client (tenant) you belong to, and where to add another.</p>
      </header>

      <Card>
        <CardHeading>Create a client</CardHeading>
        <CreateClientForm onCreated={handleCreated} compact />
        {error && <ErrorState message={error} />}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Your clients</h2>
        {memberships === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {memberships?.length === 0 && <p className="text-sm text-sx-text-subtle">No clients yet — create one above.</p>}
        {memberships && memberships.length > 0 && (
          <div className="flex flex-col gap-2">
            {memberships.map((m) => {
              const isActive = active?.tenantId === m.tenant_id;
              return (
                <Card key={m.tenant_id} variant="nested" className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sx-text">{m.tenant.name}</p>
                    <p className="text-xs text-sx-text-subtle">
                      {m.tenant.slug} · role: {m.role}
                    </p>
                  </div>
                  <Button
                    variant={isActive ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => switchTenant(m.tenant_id)}
                    disabled={isActive}
                  >
                    {isActive ? "Active" : "Use this client"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
