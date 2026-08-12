"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";
import type { ImageGenerationCandidateRow, ImageGenerationJobRow, ImageJobDetail } from "@/lib/image-generation/types";

interface ReferenceAsset {
  id: string;
  original_name: string;
  mime_type: string;
  source_type: string;
  previewUrl: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  REVIEWING: "Reviewing",
  REVISING: "Revising",
  READY: "Ready",
  FAILED: "Failed",
};

const PRESETS = [
  { value: "1:1", label: "Square", hint: "1:1" },
  { value: "4:5", label: "Portrait", hint: "4:5" },
  { value: "9:16", label: "Story / Reel", hint: "9:16" },
  { value: "16:9", label: "Landscape", hint: "16:9" },
] as const;

function signedImageLoader({ src }: { src: string }) {
  return src;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CreativeStudioWorkspace(props: {
  providerConfigured: boolean;
  subscriptionReady: boolean;
  brandBrainVersion: number | null;
  missingEnvironment: string[];
}) {
  const [brief, setBrief] = useState("");
  const [aspectRatio, setAspectRatio] = useState<(typeof PRESETS)[number]["value"]>("1:1");
  const [candidateCount, setCandidateCount] = useState(2);
  const [intendedUse, setIntendedUse] = useState("social_post");
  const [styleDirection, setStyleDirection] = useState("");
  const [jobs, setJobs] = useState<ImageGenerationJobRow[]>([]);
  const [detail, setDetail] = useState<ImageJobDetail | null>(null);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRun = useRef(0);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/platform/image-generations", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setJobs(result.jobs ?? []);
  }, []);

  const loadReferences = useCallback(async () => {
    const response = await fetch("/api/platform/image-generations/references", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setReferences(result.assets ?? []);
  }, []);

  const loadDetail = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/platform/image-generations/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Generation could not be loaded");
    setDetail(result as ImageJobDetail);
    return result as ImageJobDetail;
  }, []);

  useEffect(() => {
    void Promise.all([loadHistory(), loadReferences()]);
  }, [loadHistory, loadReferences]);

  const pollJob = useCallback(async (jobId: string) => {
    const run = ++pollRun.current;
    for (let attempt = 0; attempt < 60 && pollRun.current === run; attempt += 1) {
      const next = await loadDetail(jobId);
      if (next.job.status === "READY" || next.job.status === "FAILED") {
        await Promise.all([loadHistory(), loadReferences()]);
        setBusy(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (pollRun.current === run) {
      setMessage("Generation is still running. It is safe to leave this page and return from History.");
      setBusy(false);
    }
  }, [loadDetail, loadHistory, loadReferences]);

  const generate = async () => {
    setMessage(null);
    if (!brief.trim()) return setMessage("Describe the image you want to create.");
    setBusy(true);
    try {
      const response = await fetch("/api/platform/image-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          aspectRatio,
          candidateCount,
          intendedUse,
          styleDirection,
          referenceAssetIds: selectedReferences,
          idempotencyKey: crypto.randomUUID(),
          sourceId: `creative-studio:${Date.now()}`,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Generation could not be started");
      setDetail({ job: result.job, candidates: [], references: selectedReferences.map((asset_id) => ({ asset_id, reference_kind: "existing_asset" })) });
      await pollJob(result.job.id);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Generation could not be started");
    }
  };

  const uploadReference = async (file: File) => {
    setMessage(null);
    setUploadProgress(0);
    try {
      const preparedResponse = await fetch("/api/platform/image-generations/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", name: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error ?? "Reference upload could not be prepared");
      await uploadToSignedUrlWithProgress(prepared.signedUrl, file, setUploadProgress);
      const finalizedResponse = await fetch("/api/platform/image-generations/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", assetId: prepared.asset.id }),
      });
      const finalized = await finalizedResponse.json();
      if (!finalizedResponse.ok) throw new Error(finalized.error ?? "Reference upload could not be finalized");
      await loadReferences();
      setSelectedReferences((current) => [...new Set([...current, finalized.asset.id])]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reference upload failed");
    } finally {
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const selectCandidate = async (candidate: ImageGenerationCandidateRow) => {
    if (!detail) return;
    setMessage(null);
    const response = await fetch(`/api/platform/image-generations/${detail.job.id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: candidate.id }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "The image could not be selected");
    await loadDetail(detail.job.id);
    await loadHistory();
  };

  const reviseCandidate = async (candidate: ImageGenerationCandidateRow) => {
    if (!detail) return;
    const instruction = window.prompt("What should change in the next version?");
    if (!instruction?.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/platform/image-generations/${detail.job.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, parentCandidateId: candidate.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Revision failed");
      setDetail(result);
      await Promise.all([loadHistory(), loadReferences()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revision failed");
    } finally {
      setBusy(false);
    }
  };

  const ready = props.providerConfigured && props.subscriptionReady;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sx-ai">Creative intelligence</p>
          <h1 className="mt-1 font-sx-sans text-xl font-semibold text-sx-text">Creative Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-sx-text-muted">Create brand-aware, reusable images for Social, campaigns, and your website.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-sx-border bg-sx-surface-2 px-3 py-1.5 text-xs text-sx-text-muted">
          <span className={`h-2 w-2 rounded-full ${ready ? "bg-sx-success" : "bg-sx-warning"}`} />
          {ready ? "Image capability available" : "Setup required"}
        </div>
      </header>

      {!props.providerConfigured ? (
        <Card variant="alert"><CardHeading>Provider not configured</CardHeading><p className="mt-2 text-sm text-sx-text-muted">A server administrator must configure {props.missingEnvironment.join(", ")}. No image request will be sent until then.</p></Card>
      ) : null}
      {!props.subscriptionReady ? (
        <Card variant="alert"><CardHeading>Image generation is not included yet</CardHeading><p className="mt-2 text-sm text-sx-text-muted">An active workspace subscription is required before variable-cost image generation can run.</p></Card>
      ) : null}
      {message ? <div role="status" className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-sm text-sx-text">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        <Card variant="ai" className="h-fit">
          <CardHeading>Create</CardHeading>
          <label className="mt-4 block text-xs font-medium text-sx-text-muted" htmlFor="creative-brief">Creative brief</label>
          <textarea id="creative-brief" rows={6} maxLength={4000} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Create a premium Instagram post announcing our new service" className="mt-1.5 w-full resize-y rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-3 text-sm text-sx-text outline-none placeholder:text-sx-text-subtle focus:border-sx-ai" />
          <div className="mt-3 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
            <strong className="text-sx-text">Brand Brain</strong> · {props.brandBrainVersion ? `Version ${props.brandBrainVersion} will be used` : "No saved context yet; only your brief will be used"}
          </div>

          <fieldset className="mt-4"><legend className="text-xs font-medium text-sx-text-muted">Format</legend><div className="mt-2 grid grid-cols-2 gap-2">{PRESETS.map((preset) => <button type="button" key={preset.value} onClick={() => setAspectRatio(preset.value)} className={`rounded-sx-sm border p-2.5 text-left ${aspectRatio === preset.value ? "border-sx-ai bg-[rgb(79_220_229_/_0.08)]" : "border-sx-border bg-sx-surface-2"}`}><span className="block text-xs font-medium text-sx-text">{preset.label}</span><span className="text-[11px] text-sx-text-subtle">{preset.hint}</span></button>)}</div></fieldset>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-xs text-sx-text-muted">Intended use<select value={intendedUse} onChange={(event) => setIntendedUse(event.target.value)} className="mt-1.5 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-2 text-sm text-sx-text"><option value="social_post">Social post</option><option value="campaign">Campaign</option><option value="website">Website</option><option value="ad_creative">Ad creative</option><option value="general">General</option></select></label>
            <label className="text-xs text-sx-text-muted">Candidates<select value={candidateCount} onChange={(event) => setCandidateCount(Number(event.target.value))} className="mt-1.5 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-2 text-sm text-sx-text"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
          </div>
          <label className="mt-4 block text-xs text-sx-text-muted">Creative direction (optional)<input value={styleDirection} maxLength={500} onChange={(event) => setStyleDirection(event.target.value)} placeholder="Editorial, warm natural light, minimal typography" className="mt-1.5 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-2.5 text-sm text-sx-text" /></label>

          <div className="mt-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-sx-text-muted">References</span><input ref={fileRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReference(file); }} /><Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploadProgress !== null}>{uploadProgress === null ? "Upload image" : `${uploadProgress}%`}</Button></div>
            {references.length ? <div className="mt-2 grid grid-cols-4 gap-2">{references.slice(0, 8).map((asset) => <button key={asset.id} type="button" title={asset.original_name} onClick={() => setSelectedReferences((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : current.length < 5 ? [...current, asset.id] : current)} className={`relative aspect-square overflow-hidden rounded-sx-sm border-2 ${selectedReferences.includes(asset.id) ? "border-sx-ai" : "border-transparent"}`}>{asset.previewUrl ? <Image loader={signedImageLoader} unoptimized fill sizes="96px" src={asset.previewUrl} alt={asset.original_name} className="object-cover" /> : <span className="text-[10px]">Image</span>}</button>)}</div> : <p className="mt-2 text-xs text-sx-text-subtle">Upload a logo, product photo, or choose a previous generated image.</p>}
          </div>
          <Button type="button" variant="primary" size="touch" className="mt-5 w-full" onClick={() => void generate()} disabled={!ready || busy || !brief.trim()}>{busy ? "Generating…" : "Generate images"}</Button>
          <p className="mt-2 text-center text-[11px] text-sx-text-subtle">Generation is metered. Duplicate clicks and retries reuse one persisted job.</p>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="min-h-[420px]">
            <div className="flex items-center justify-between gap-3"><CardHeading>Results</CardHeading>{detail ? <span className="rounded-full border border-sx-border px-2 py-1 text-[11px] text-sx-text-muted">{STATUS_LABEL[detail.job.status] ?? detail.job.status}</span> : null}</div>
            {!detail ? <div className="flex min-h-[340px] items-center justify-center text-center"><div><p className="text-sm font-medium text-sx-text">Your candidates will appear here</p><p className="mt-1 text-xs text-sx-text-subtle">They are persisted to this workspace and remain available in History.</p></div></div> : detail.job.status === "FAILED" ? <div className="mt-8 rounded-sx-md border border-[rgb(242_86_95_/_0.35)] bg-[rgb(242_86_95_/_0.06)] p-5"><p className="font-medium text-sx-text">Generation failed</p><p className="mt-2 text-sm text-sx-text-muted">{detail.job.safe_error ?? "No canonical image was created."}</p><p className="mt-2 text-xs text-sx-text-subtle">Code: {detail.job.error_code ?? "GENERATION_FAILED"}</p></div> : detail.candidates.length === 0 ? <div className="flex min-h-[340px] items-center justify-center text-center"><div><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sx-border-strong border-t-sx-ai" /><p className="mt-4 text-sm text-sx-text">{STATUS_LABEL[detail.job.status] ?? "Processing"}</p><p className="mt-1 text-xs text-sx-text-subtle">You can leave safely; the persisted job remains in History.</p></div></div> : <div className="mt-4 grid gap-4 md:grid-cols-2">{detail.candidates.map((candidate) => <article key={candidate.id} className={`overflow-hidden rounded-sx-md border ${candidate.status === "SELECTED" ? "border-sx-success" : "border-sx-border"}`}><div className="relative aspect-square bg-sx-surface-2">{candidate.preview_url ? <Image loader={signedImageLoader} unoptimized fill sizes="(max-width: 768px) 100vw, 40vw" src={candidate.preview_url} alt={`Generated candidate ${candidate.id}`} className="object-contain" /> : null}</div><div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-sx-text">{candidate.status === "SELECTED" ? "Selected asset" : `Version ${candidate.revision_number + 1}`}</span><span className="text-[10px] text-sx-text-subtle">{candidate.provider} · {candidate.model}</span></div><p className="mt-2 text-[11px] text-sx-text-subtle">Automated preflight is advisory; confirm text, logo, product fidelity, and claims before publishing.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={candidate.status === "SELECTED" ? "secondary" : "primary"} onClick={() => void selectCandidate(candidate)} disabled={candidate.status === "SELECTED"}>Select</Button><Button size="sm" onClick={() => void reviseCandidate(candidate)} disabled={busy || detail.job.revision_count >= 3}>Revise</Button>{candidate.preview_url ? <a href={candidate.preview_url} download className="inline-flex h-7 items-center rounded-sx-sm border border-sx-border-strong px-2.5 text-[11.5px] text-sx-text-muted">Download</a> : null}{candidate.status === "SELECTED" ? <Link href={`/app/content/pipeline?mediaAssetId=${candidate.asset_id}&generationJobId=${detail.job.id}`} className="inline-flex h-7 items-center rounded-sx-sm border border-sx-border-strong px-2.5 text-[11.5px] text-sx-text-muted">Use in Social</Link> : null}</div></div></article>)}</div>}
          </Card>

          <Card><CardHeading>History</CardHeading>{jobs.length === 0 ? <p className="mt-3 text-sm text-sx-text-subtle">No generations yet.</p> : <div className="mt-3 divide-y divide-sx-border">{jobs.map((job) => <button type="button" key={job.id} onClick={() => void loadDetail(job.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left"><div className="min-w-0"><p className="truncate text-sm text-sx-text">{job.brief}</p><p className="mt-0.5 text-[11px] text-sx-text-subtle">{shortDate(job.created_at)} · {job.source_context.replaceAll("_", " ")} · {job.provider ?? "Provider pending"}</p></div><span className="shrink-0 text-xs text-sx-text-muted">{STATUS_LABEL[job.status] ?? job.status}</span></button>)}</div>}</Card>
        </div>
      </div>
    </div>
  );
}
