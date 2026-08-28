"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { ErrorState } from "@/components/ui/Feedback";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";

interface VariantResult {
  assetId: string;
  url: string | null;
}
interface AnalyzeResponse {
  variants: {
    transparent: VariantResult;
    monoLight: VariantResult;
    monoDark: VariantResult;
    badge: VariantResult;
  };
  backgroundRemoved: boolean;
}

const VARIANT_LABELS: Record<keyof AnalyzeResponse["variants"], { label: string; hint: string; swatch: string }> = {
  transparent: { label: "Original (cleaned)", hint: "Full color, background removed", swatch: "bg-[repeating-conic-gradient(#d0d0d0_0%_25%,#f4f4f4_0%_50%)] bg-[length:16px_16px]" },
  monoLight: { label: "Mono Light", hint: "For dark layouts & photos", swatch: "bg-[#1a1a1a]" },
  monoDark: { label: "Mono Dark", hint: "For light layouts & photos", swatch: "bg-[#f4f4f0]" },
  badge: { label: "Bounded Badge", hint: "For busy/complex photo backgrounds", swatch: "bg-[#e5e5e0]" },
};

/**
 * BrandBrain Logo Engine Phase 3/4: the real "Upload Logo" flow --
 * upload (the same fixed signed-upload protocol as the general Photos
 * gallery) -> analyze (lib/brand/logo-analyzer.ts via
 * /api/platform/brand/logo-analyze) -> a visual selector for all 4 real
 * generated variants -> save into brand_brains content. The "upload a
 * pre-cleaned transparent PNG instead" fallback isn't a separate code
 * path: analyzeLogo already correctly no-ops (backgroundRemoved: false,
 * keeps the source unchanged) when given a real transparent PNG, so
 * re-running the exact same flow on a cleaner source image IS the
 * fallback -- it still gets real mono/badge variants generated from it.
 *
 * "Use this logo" persists immediately (its own GET-merge-POST to
 * /api/platform/brand), rather than only staging the change into the
 * page's shared unsaved-edits state -- a user who finishes this whole
 * upload/analyze/select flow and then navigates away before remembering
 * to click the page's separate "Save Changes" button would otherwise
 * silently lose it. A fresh GET immediately before merging keeps this
 * from clobbering (or being clobbered by) whatever else the page's own
 * in-memory content state hasn't saved yet.
 */
export function LogoAnalyzerFlow({
  tenantId,
  readOnly,
  onSaved,
}: {
  tenantId: string;
  readOnly: boolean;
  onSaved: (result: { logoUrl: string; logoTransparentUrl: string | null; logoVariants: Record<string, { assetId: string }> }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "analyzing" | "selecting" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [selectedKind, setSelectedKind] = useState<keyof AnalyzeResponse["variants"]>("transparent");

  const reset = () => {
    setStage("idle");
    setAnalysis(null);
    setError(null);
  };

  async function handleFile(file: File) {
    setError(null);
    setStage("uploading");
    try {
      const prepareRes = await fetch("/api/platform/brand/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "prepare", name: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok) throw new Error(prepareData.error || "We couldn't start your upload right now.");
      const { assetId, signedUrl } = prepareData as { assetId: string; signedUrl: string };
      await uploadToSignedUrlWithProgress(signedUrl, file, () => {});

      const finalizeRes = await fetch("/api/platform/brand/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "finalize", assetId }),
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finalizeData.error || "We couldn't finish your upload right now.");

      setStage("analyzing");
      const analyzeRes = await fetch("/api/platform/brand/logo-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, sourceAssetId: assetId }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "We couldn't analyze this logo.");

      setAnalysis(analyzeData as AnalyzeResponse);
      setSelectedKind("transparent");
      setStage("selecting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't process your logo right now.");
      setStage("idle");
    }
  }

  async function confirmSelection() {
    if (!analysis) return;
    setStage("saving");
    setError(null);
    try {
      const logoVariants = Object.fromEntries(
        (Object.keys(analysis.variants) as Array<keyof AnalyzeResponse["variants"]>).map((kind) => [kind, { assetId: analysis.variants[kind].assetId }])
      );
      const chosen = analysis.variants[selectedKind];
      const logoUrl = chosen.url ?? analysis.variants.transparent.url ?? "";
      const logoTransparentUrl = analysis.variants.transparent.url;

      const currentRes = await fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`);
      const currentData = await currentRes.json();
      if (!currentRes.ok) throw new Error(currentData.error || "We couldn't load your current brand settings.");
      const currentContent = (currentData.brandBrain?.content ?? {}) as Record<string, unknown>;

      const mergedContent = { ...currentContent, logo_url: logoUrl, logo_transparent_url: logoTransparentUrl ?? undefined, logo_variants: logoVariants };
      const saveRes = await fetch("/api/platform/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, content: mergedContent }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "We couldn't save your logo selection.");

      onSaved({ logoUrl, logoTransparentUrl, logoVariants });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your logo selection.");
      setStage("selecting");
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={readOnly || stage === "uploading" || stage === "analyzing"}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-sx-xs bg-sx-surface-2 border border-sx-border px-2.5 py-1 text-xs font-semibold text-sx-text hover:bg-sx-surface-3 transition-colors disabled:opacity-50"
      >
        {stage === "uploading" ? "Uploading…" : stage === "analyzing" ? "Analyzing…" : "Upload Logo"}
      </button>
      {error && stage === "idle" && <p className="mt-2 text-xs text-sx-danger">{error}</p>}

      <Modal open={stage === "selecting" || stage === "saving"} onClose={reset} title="Choose the best logo for your automated creatives" size="lg">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-sx-text-muted">
            {analysis?.backgroundRemoved
              ? "We removed the background and generated 4 versions for different backgrounds. Pick the one you'd like as your primary logo — every version stays saved and is used automatically on the right layout."
              : "We couldn't confidently detect a background to remove, so these are generated from your image as-is. If it doesn't look right, upload a pre-cleaned transparent PNG below."}
          </p>
          {analysis && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(analysis.variants) as Array<keyof AnalyzeResponse["variants"]>).map((kind) => {
                const variant = analysis.variants[kind];
                const meta = VARIANT_LABELS[kind];
                const selected = selectedKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setSelectedKind(kind)}
                    className={`flex flex-col overflow-hidden rounded-sx-md border text-left transition-colors ${selected ? "border-sx-accent ring-2 ring-sx-accent" : "border-sx-border hover:border-sx-border-strong"}`}
                  >
                    <div className={`relative flex aspect-square items-center justify-center p-4 ${meta.swatch}`}>
                      {variant.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={variant.url} alt={meta.label} className="max-h-full max-w-full object-contain" />
                      )}
                      {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sx-accent text-[11px] font-bold text-sx-accent-on">✓</span>}
                    </div>
                    <div className="p-2">
                      <p className="text-[11.5px] font-semibold text-sx-text">{meta.label}</p>
                      <p className="text-[10.5px] text-sx-text-subtle">{meta.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {error && <ErrorState message={error} />}
          <div className="flex items-center justify-between gap-2 border-t border-sx-border pt-3">
            <button
              type="button"
              onClick={() => {
                reset();
                fileInputRef.current?.click();
              }}
              className="text-[11.5px] font-semibold text-sx-accent hover:underline"
            >
              Not looking right? Upload a pre-cleaned transparent PNG instead
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={stage === "saving"}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void confirmSelection()} disabled={stage === "saving" || !analysis}>
                {stage === "saving" ? "Saving…" : "Use this logo"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
