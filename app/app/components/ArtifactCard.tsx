import Link from "next/link";
import { Card } from "@/components/ui/Card";

export interface ArtifactSummary {
  id: string;
  file_name: string;
  mime_type?: string | null;
  folder_category?: string;
  size_bytes?: number | null;
  created_at: string;
}

function formatSize(bytes?: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File/artifact row reused by Files and Website (artifacts produced by a mission). */
export function ArtifactCard({ artifact, href }: { artifact: ArtifactSummary; href?: string }) {
  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-sx-text" title={artifact.file_name}>
          {artifact.file_name}
        </p>
        <p className="mt-0.5 text-xs text-sx-text-subtle">
          {artifact.folder_category ?? "uncategorized"} · {formatSize(artifact.size_bytes)} · {new Date(artifact.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-border-strong">
        {body}
      </Link>
    );
  }
  return <Card variant="nested">{body}</Card>;
}
