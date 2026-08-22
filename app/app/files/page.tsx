"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { IntegrationStatus } from "../components/IntegrationStatus";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { Input } from "@/components/ui/Input";
import { Card, CardRow } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import dynamic from "next/dynamic";

const DetailPanel = dynamic(
  () => import("../components/DetailPanel").then((mod) => mod.DetailPanel),
  { ssr: false }
);

export interface ArtifactRow {
  id: string;
  tenant_id: string;
  storage_connection_id: string;
  provider_file_id: string;
  folder_category: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface StorageConnection {
  provider: string;
  status: string;
  account_email: string | null;
}

const FOLDER_LABELS: Record<string, string> = {
  brand_assets: "Brand assets",
  source_uploads: "Uploaded source files",
  social_media: "Social media",
  campaigns: "Campaigns",
  website: "Website files",
  reports: "Reports",
  proposals: "Proposals",
  legal_documents: "Legal documents",
  archive: "Archive",
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [artifacts, setArtifacts] = useState<ArtifactRow[] | null>(null);
  const [connection, setConnection] = useState<StorageConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ArtifactRow | null>(null);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load files (HTTP ${res.status})`);
      return;
    }
    setArtifacts(body.artifacts);
    setConnection(body.connection);
  }

  const initialTenantRef = useRef(tenantId);
  useEffect(() => {
    if (tenantId) {
      initialTenantRef.current = tenantId;
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of artifacts ?? []) counts[a.folder_category] = (counts[a.folder_category] ?? 0) + 1;
    return counts;
  }, [artifacts]);

  const filtered = (artifacts ?? [])
    .filter((a) => !typeFilter || a.folder_category === typeFilter)
    .filter((a) => !search.trim() || a.file_name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Files" tenantName={active?.name} description="Mission outputs, uploaded source files, and documents for this workspace." />

      {error && <ErrorState message={error} onRetry={load} />}

      <IntegrationStatus
        name="Google Drive"
        state={(connection?.status as "connected" | "disconnected" | "connecting" | "revoked" | "error") ?? "disconnected"}
        detail={connection?.account_email ?? "Not connected — file upload requires a connected storage provider."}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files by name…" className="sm:max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`rounded-sx-pill border px-2.5 py-1 text-[11.5px] transition-colors ${
              typeFilter === null ? "border-sx-accent text-sx-accent" : "border-sx-border-strong text-sx-text-muted hover:text-sx-text"
            }`}
          >
            All
          </button>
          {Object.entries(FOLDER_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(typeFilter === key ? null : key)}
              className={`rounded-sx-pill border px-2.5 py-1 text-[11.5px] transition-colors ${
                typeFilter === key ? "border-sx-accent text-sx-accent" : "border-sx-border-strong text-sx-text-muted hover:text-sx-text"
              }`}
            >
              {label} {folderCounts[key] ? `(${folderCounts[key]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        {tenantId && artifacts === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {artifacts && filtered.length === 0 && (
          <EmptyModuleState resource="files" subtitle="Files produced by missions, or uploaded once a storage provider is connected, will appear here." />
        )}
        {filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelected(a)}
                className="flex items-center justify-between gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 text-left transition-colors hover:border-sx-border-strong"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-sx-text">{a.file_name}</p>
                  <p className="mt-0.5 text-xs text-sx-text-subtle">
                    {FOLDER_LABELS[a.folder_category] ?? a.folder_category} · {formatSize(a.size_bytes)} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <DetailPanel open={selected !== null} onClose={() => setSelected(null)} title={selected?.file_name ?? "File"}>
        {selected && (
          <div className="flex flex-col gap-1 text-xs text-sx-text-muted">
            <Card variant="nested">
              <CardRow>
                <span className="text-sx-text-muted">Type</span>
                <span>{selected.mime_type ?? "—"}</span>
              </CardRow>
              <CardRow>
                <span className="text-sx-text-muted">Category</span>
                <span>{FOLDER_LABELS[selected.folder_category] ?? selected.folder_category}</span>
              </CardRow>
              <CardRow>
                <span className="text-sx-text-muted">Size</span>
                <span>{formatSize(selected.size_bytes)}</span>
              </CardRow>
              <CardRow>
                <span className="text-sx-text-muted">Source mission</span>
                <span>{(selected.metadata?.missionId as string) ?? "—"}</span>
              </CardRow>
              <CardRow>
                <span className="text-sx-text-muted">Created</span>
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </CardRow>
            </Card>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
