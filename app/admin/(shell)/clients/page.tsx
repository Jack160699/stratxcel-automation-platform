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
  const [deletingTenant, setDeletingTenant] = useState<AgencyTenant | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadTenants() {
    setError(null);
    const res = await fetch("/api/platform/tenants", { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed to load clients (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { tenants: AgencyTenant[] };
    setTenants(body.tenants);
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  async function handleCreated(tenant: { id: string }) {
    await loadTenants();
    router.push(`/admin/clients/${tenant.id}`);
    router.refresh();
  }

  async function handleDeleteClient() {
    if (!deletingTenant || confirmInput !== "DELETE") return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/platform/admin/clients/${deletingTenant.tenantId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to delete client (HTTP ${res.status})`);
      }

      setDeletingTenant(null);
      setConfirmInput("");
      await loadTenants();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/clients/${tenant.tenantId}`}
                    className="rounded-sx-sm bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover"
                  >
                    Open client
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingTenant(tenant);
                      setConfirmInput("");
                      setDeleteError(null);
                    }}
                    className="rounded-sx-sm border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Delete Client Confirmation Modal */}
      {deletingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-sx-md border border-red-500/40 bg-sx-surface-1 p-6 shadow-2xl">
            <h3 className="font-sx-sans text-lg font-semibold text-sx-text">Delete this client?</h3>
            
            <div className="my-4 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
              <p><span className="font-semibold text-sx-text">Client:</span> {deletingTenant.name}</p>
              <p className="mt-1"><span className="font-semibold text-sx-text">Workspace:</span> {deletingTenant.slug}</p>
            </div>

            <div className="rounded-sx-sm bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
              ⚠️ <span className="font-semibold">Warning:</span> This permanently removes the customer&apos;s workspace and disposable customer data. This cannot be undone.
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-sx-text-muted mb-1">
                Type <span className="font-bold text-red-400">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-2 text-sm text-sx-text focus:border-red-500 focus:outline-none"
              />
            </div>

            {deleteError && (
              <div className="mt-3 text-xs text-red-400">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTenant(null)}
                className="rounded-sx-sm border border-sx-border px-4 py-2 text-xs font-medium text-sx-text hover:bg-sx-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmInput !== "DELETE" || isDeleting}
                onClick={() => void handleDeleteClient()}
                className="rounded-sx-sm bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
              >
                {isDeleting ? "Deleting…" : "Delete Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
