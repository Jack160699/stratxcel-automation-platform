"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";

export function UseGeneratedAsset({ generated, variants }: {
  generated: { jobId: string; candidateId: string; assetId: string };
  variants: Array<{ id: string; label: string }>;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attach = async () => {
    if (!variantId) return;
    setBusy(true);
    const response = await fetch(`/api/platform/image-generations/${generated.jobId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: generated.candidateId, socialVariantId: variantId }),
    });
    const result = await response.json();
    setBusy(false);
    setStatus(response.ok ? "Generated asset added to the Social post. Existing approval and publishing gates still apply." : result.error ?? "The asset could not be added.");
  };
  return <Card variant="ai">
    <CardHeading>Use selected image in Social</CardHeading>
    <p className="mt-2 text-sm text-sx-text-muted">This is canonical media asset <span className="font-mono text-xs text-sx-text">{generated.assetId.slice(0, 8)}</span>. Choose a current post; scheduling and publishing remain approval-gated.</p>
    {variants.length ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="min-w-0 flex-1 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-2 text-sm text-sx-text">{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select><Button variant="primary" onClick={() => void attach()} disabled={busy}>{busy ? "Adding…" : "Add to post"}</Button></div> : <p className="mt-3 text-sm text-sx-warning">No existing Social post is available. Create a post first, then return to this asset from Studio history.</p>}
    {status ? <p className="mt-3 text-xs text-sx-text-muted" role="status">{status}</p> : null}
    <Link href="/app/content/studio" className="mt-3 inline-block text-xs text-sx-ai">Back to Creative Studio</Link>
  </Card>;
}
