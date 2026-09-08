"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminUniversalDrawer, AdminDrawerSection, AdminDrawerRow } from "@/components/admin/ui/AdminUniversalDrawer";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { CreateClientForm } from "@/components/forms/CreateClientForm";
import { ErrorState } from "@/components/ui/Feedback";
import { Building2, Plus, Search, Trash2, ExternalLink, RefreshCw, X } from "lucide-react";

interface AgencyTenant {
  tenantId: string;
  name: string;
  slug: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<AgencyTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<AgencyTenant | null>(null);

  const [deletingTenant, setDeletingTenant] = useState<AgencyTenant | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadTenants() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Failed to load clients (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { tenants: AgencyTenant[] };
      setTenants(body.tenants);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  async function handleCreated(tenant: { id: string }) {
    setCreateModalOpen(false);
    await loadTenants();
    router.push(`/admin/clients/${tenant.id}`);
    router.refresh();
  }

  async function handleDeleteClient() {
    if (!deletingTenant || confirmInput !== "DELETE") return;
    setIsDeleting(true);
    setDeleteError(null);
    setSuccessMessage(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`/api/platform/admin/clients/${deletingTenant.tenantId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const deletedName = deletingTenant.name;
      setDeletingTenant(null);
      setSelectedTenant(null);
      setConfirmInput("");
      setSuccessMessage(`Client "${deletedName}" deleted successfully.`);
      await loadTenants();
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const message = isAbort
        ? "Request timed out after 15s. The server is still processing."
        : err instanceof Error
        ? err.message
        : "Delete failed";
      setDeleteError(`Unable to delete this client: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredTenants = useMemo(() => {
    if (!tenants) return [];
    if (!searchQuery.trim()) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants, searchQuery]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Workspace / Clients"
        title="Clients & Workspaces"
        description="Every agency client company, dedicated database workspace, and isolation boundary."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadTenants}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent-hover"
            >
              <Plus size={14} />
              <span>New Client</span>
            </button>
          </div>
        }
      />

      {successMessage && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          ✓ {successMessage}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadTenants} />}

      {/* Filter Bar */}
      <div className="flex items-center gap-2 rounded-lg border border-sx-border/70 bg-sx-surface-1 px-3 py-1.5 text-xs text-sx-text-muted w-full sm:w-72">
        <Search size={14} className="text-sx-text-subtle" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter clients by name or slug…"
          className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none"
        />
      </div>

      {/* Tenants List */}
      {tenants === null ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-sx-md border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
          ))}
        </div>
      ) : filteredTenants.length === 0 ? (
        <AdminEmptyState
          icon={<Building2 size={20} />}
          title={searchQuery.trim() ? "No matching clients" : "No clients configured"}
          description={
            searchQuery.trim()
              ? "No client workspaces match your filter."
              : "Create your first client company workspace above."
          }
          action={
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover"
            >
              <Plus size={13} />
              <span>Create Client</span>
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTenants.map((tenant) => (
            <AdminEntityRow
              key={tenant.tenantId}
              icon={<Building2 size={16} className="text-sx-accent" />}
              title={tenant.name}
              subtitle={`Workspace slug: /${tenant.slug}`}
              status={<AdminStatusDot status="connected" customLabel="Active" />}
              primaryAction={
                <Link
                  href={`/admin/clients/${tenant.tenantId}`}
                  className="rounded-lg bg-sx-surface-2 px-3 py-1 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1 hover:text-sx-accent border border-sx-border/60"
                >
                  Open
                </Link>
              }
              onOpenDetails={() => setSelectedTenant(tenant)}
              detailsAriaLabel={`Inspect client ${tenant.name}`}
            />
          ))}
        </div>
      )}

      {/* Universal Drawer for Selected Client */}
      {selectedTenant && (
        <AdminUniversalDrawer
          open={Boolean(selectedTenant)}
          onClose={() => setSelectedTenant(null)}
          entityType="CLIENT WORKSPACE"
          title={selectedTenant.name}
          subtitle={`Slug: /${selectedTenant.slug}`}
          icon={<Building2 size={20} className="text-sx-accent" />}
          statusBadge={<AdminStatusDot status="connected" customLabel="Active Workspace" />}
          actions={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => {
                  setDeletingTenant(selectedTenant);
                  setConfirmInput("");
                  setDeleteError(null);
                }}
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium"
              >
                <Trash2 size={13} />
                <span>Delete Client</span>
              </button>
              <Link
                href={`/admin/clients/${selectedTenant.tenantId}`}
                className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover"
              >
                <span>Open Workspace</span>
                <ExternalLink size={13} />
              </Link>
            </div>
          }
        >
          <AdminDrawerSection title="Workspace Details">
            <AdminDrawerRow label="Company Name" value={selectedTenant.name} />
            <AdminDrawerRow label="Slug" value={`/${selectedTenant.slug}`} mono />
            <AdminDrawerRow label="Tenant ID" value={selectedTenant.tenantId} mono />
          </AdminDrawerSection>

          <AdminDrawerSection title="Customer Access">
            <p className="text-xs text-sx-text-muted leading-relaxed">
              This client workspace is isolated under row-level security. Staff can access missions, leads, campaigns,
              and settings through the Client Switcher in the top bar.
            </p>
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}

      {/* Create Client Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-sx-border bg-sx-surface-1 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-sx-text">Create a Client Workspace</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-sx-text-subtle hover:text-sx-text"
              >
                <X size={16} />
              </button>
            </div>
            <CreateClientForm onCreated={handleCreated} compact />
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Modal */}
      {deletingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-sx-surface-1 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-sx-text">Delete client workspace?</h3>

            <div className="my-4 rounded-lg border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
              <p>
                <span className="font-semibold text-sx-text">Client:</span> {deletingTenant.name}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-sx-text">Workspace:</span> {deletingTenant.slug}
              </p>
            </div>

            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
              ⚠️ <span className="font-semibold">Warning:</span> Permanently removes this workspace and disposable customer data. This cannot be undone.
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
                className="w-full rounded-lg border border-sx-border bg-sx-surface-2 px-3 py-2 text-sm text-sx-text focus:border-red-500 focus:outline-none"
              />
            </div>

            {deleteError && <div className="mt-3 text-xs text-red-400">{deleteError}</div>}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTenant(null)}
                className="rounded-lg border border-sx-border px-3.5 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmInput !== "DELETE" || isDeleting}
                onClick={() => void handleDeleteClient()}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
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
