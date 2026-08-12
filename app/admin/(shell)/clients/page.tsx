"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateClientForm } from "@/components/forms/CreateClientForm";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";

interface AgencyTenant {
  tenantId: string;
  name: string;
  slug: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<AgencyTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadTenants() {
    setError(null);
    const res = await fetch("/api/platform/tenants");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed to load clients (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { tenants: AgencyTenant[] };
    setTenants(body.tenants);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTenants();
  }, []);

  async function handleCreated(tenant: { id: string }) {
    await loadTenants();
    router.push(`/admin/clients/${tenant.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Clients</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every agency client, independent of customer workspace membership.</p>
      </header>

      <Card>
        <CardHeading>Create a client</CardHeading>
        <CreateClientForm onCreated={handleCreated} compact />
        {error && <ErrorState message={error} />}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Agency clients</h2>
        {tenants === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenants?.length === 0 && <p className="text-sm text-sx-text-subtle">No clients yet — create one above.</p>}
        {tenants && tenants.length > 0 && (
          <div className="flex flex-col gap-2">
            {tenants.map((tenant) => (
              <Card key={tenant.tenantId} variant="nested" className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sx-text">{tenant.name}</p>
                  <p className="text-xs text-sx-text-subtle">{tenant.slug}</p>
                </div>
                <Link
                  href={`/admin/clients/${tenant.tenantId}`}
                  className="rounded-sx-sm bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover"
                >
                  Open client
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
