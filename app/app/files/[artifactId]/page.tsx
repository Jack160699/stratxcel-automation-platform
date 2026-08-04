"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentTenant } from "../../CurrentTenantContext";
import type { ArtifactRow } from "../page";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * No dedicated single-artifact GET route — reuses the tenant-scoped
 * artifacts list and filters client-side, same convention as
 * /app/missions/[missionId] and /app/crm/[leadId]. Authorization is
 * therefore identical to the list: requireTenantContext inside
 * app/api/platform/artifacts/route.ts, so a caller can only ever see an
 * artifact that belongs to their own active tenant — there is no
 * cross-tenant lookup path here.
 */
export default function ArtifactDetailPage() {
  const params = useParams<{ artifactId: string }>();
  const artifactId = params.artifactId;
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [artifact, setArtifact] = useState<ArtifactRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setError(null);
    setArtifact(undefined);
    try {
      const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load file (HTTP ${res.status})`);
        return;
      }
      setArtifact((body.artifacts as ArtifactRow[]).find((a) => a.id === artifactId) ?? null);
    } catch {
      setError("Failed to load file");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, artifactId]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/app/files" className="text-xs text-sx-text-muted hover:text-sx-text">
          ← Files
        </Link>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">File</h1>
      </header>

      {error && <ErrorState message={error} />}
      {artifact === undefined && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
      {artifact === null && !error && <EmptyState title="File not found." subtitle="It may belong to a different workspace or no longer exist." />}

      {artifact && (
        <Card>
          <CardHeading>{artifact.file_name}</CardHeading>
          <CardRow>
            <span className="text-sx-text-muted">Type</span>
            <span>{artifact.mime_type ?? "—"}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Category</span>
            <span>{artifact.folder_category}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Size</span>
            <span>{formatSize(artifact.size_bytes)}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Source mission</span>
            <span>{(artifact.metadata?.missionId as string) ?? "—"}</span>
          </CardRow>
          <CardRow>
            <span className="text-sx-text-muted">Created</span>
            <span>{new Date(artifact.created_at).toLocaleString()}</span>
          </CardRow>
        </Card>
      )}
    </div>
  );
}
