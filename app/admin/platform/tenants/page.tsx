"use client";

import { useEffect, useState } from "react";
import { useTenantId } from "../useTenantId";

interface Membership {
  tenant_id: string;
  role: string;
  tenant: { id: string; slug: string; name: string };
}

export default function TenantsPage() {
  const [tenantId, setTenantId] = useTenantId();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    loadMemberships();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create tenant (HTTP ${res.status})`);
        return;
      }
      setSlug("");
      setName("");
      await loadMemberships();
      setTenantId(body.tenant.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-base font-medium text-slate-200">Create a tenant</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-400">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Acme Retail"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-400">
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              pattern="[a-z0-9-]+"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="acme-retail"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create tenant"}
          </button>
        </form>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Your tenants</h2>
        {memberships === null && <p className="text-sm text-slate-500">Loading…</p>}
        {memberships?.length === 0 && <p className="text-sm text-slate-500">No tenants yet — create one above.</p>}
        {memberships && memberships.length > 0 && (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
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
                  onClick={() => setTenantId(m.tenant_id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    tenantId === m.tenant_id ? "bg-emerald-400/20 text-emerald-300" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {tenantId === m.tenant_id ? "Active" : "Use this tenant"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
