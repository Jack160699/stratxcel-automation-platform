"use client";

export function TenantIdBar({ tenantId, onChange }: { tenantId: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm">
      <label className="text-slate-400">Tenant ID</label>
      <input
        value={tenantId}
        onChange={(e) => onChange(e.target.value)}
        placeholder="paste a tenant ID from the Tenants page"
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
      />
    </div>
  );
}
