"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  smartWebsiteCreatorController,
  compileMasterWebsitePrompt,
  type CreatorSessionState,
} from "@stratxcel/websites-and-domains/client";

interface CreateYourWebsiteWorkspaceProps {
  tenantId: string;
  tenantName?: string | null;
}

type OuterStep = "business" | "style" | "images" | "generate" | "review" | "publish";

const STEP_LABELS: Record<OuterStep, string> = {
  business: "Tell us about your business",
  style: "Choose your style",
  images: "Add logo / images",
  generate: "Generate website",
  review: "Review",
  publish: "Publish",
};
const STEP_ORDER: OuterStep[] = ["business", "style", "images", "generate", "review", "publish"];

interface WebsiteImage {
  id: string;
  name: string;
  url: string | null;
}

interface CreatedProject {
  id: string;
  name: string;
  slug: string;
  previewUrl: string;
  custom_domain?: string | null;
}

const DRAFT_KEY_PREFIX = "stratxcel_create_website_draft_";

function loadDraft(tenantId: string): { step: OuterStep; brief: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${tenantId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function CreateYourWebsiteWorkspace({ tenantId, tenantName }: CreateYourWebsiteWorkspaceProps) {
  const router = useRouter();

  const [state, setState] = useState<CreatorSessionState>(() =>
    smartWebsiteCreatorController.initializeSession({ tenantId })
  );
  const [outerStep, setOuterStep] = useState<OuterStep>("business");
  const [inputMessage, setInputMessage] = useState("");
  const [siteLanguage, setSiteLanguage] = useState<"english" | "hindi" | "bilingual">("english");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");

  const [logo, setLogo] = useState<WebsiteImage | null>(null);
  const [images, setImages] = useState<WebsiteImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);

  const [credits, setCredits] = useState<{ limit: number | null; remaining: number | null; hasPlanEntitlement: boolean } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "unsaved">("saved");

  const hydrated = useRef(false);

  // Restore in-progress wizard input (never lose a draft to accidental navigation).
  useEffect(() => {
    const draft = loadDraft(tenantId);
    if (draft?.brief) {
      setInputMessage(draft.brief);
      if (draft.step && draft.step !== "review" && draft.step !== "publish") setOuterStep(draft.step);
    }
    hydrated.current = true;
  }, [tenantId]);

  useEffect(() => {
    if (!hydrated.current || createdProject) return;
    try {
      window.sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${tenantId}`, JSON.stringify({ step: outerStep, brief: inputMessage }));
      setSaveState("saved");
    } catch {
      setSaveState("unsaved");
    }
  }, [tenantId, outerStep, inputMessage, createdProject]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/website-factory/credits?tenantId=${encodeURIComponent(tenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setCredits(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const styleQuestion = useMemo(() => state.questions.find((q) => q.fieldKey === "visualStyle"), [state.questions]);

  function currentBusinessQuestion() {
    // Walk state.questions (in the controller's original order) but skip the
    // style question — it gets its own outer step below.
    const q = state.questions[state.currentQuestionIndex];
    if (!q) return null;
    if (q.fieldKey === "visualStyle") return null;
    return q;
  }

  function answerCurrent(payload: { selectedOptionId?: string; customText?: string }) {
    const q = state.questions[state.currentQuestionIndex];
    if (!q) return;
    const next = smartWebsiteCreatorController.answerQuestion(state, {
      questionId: q.id,
      selectedOptionId: payload.selectedOptionId,
      customText: payload.customText,
    });
    setState(next);
    setSelectedOptionId(null);
    setCustomAnswer("");
    advanceOuterStepFrom(next);
  }

  function advanceOuterStepFrom(next: CreatorSessionState) {
    if (next.step === "SUMMARY") {
      // All questions (including style) are answered — move to Images.
      setOuterStep("images");
      return;
    }
    const nextQ = next.questions[next.currentQuestionIndex];
    if (nextQ && nextQ.fieldKey === "visualStyle") {
      setOuterStep("style");
    } else {
      setOuterStep("business");
    }
  }

  /** Single back handler for every question-driven step — walks the same
   * currentQuestionIndex the forward flow advances, so it can never point
   * outerStep at a step whose question doesn't actually exist. */
  function handleBack() {
    if (outerStep === "images") {
      const lastIndex = Math.max(0, state.questions.length - 1);
      const lastQ = state.questions[lastIndex];
      setState((prev) => ({ ...prev, step: "QUESTIONS", currentQuestionIndex: lastIndex }));
      setOuterStep(lastQ?.fieldKey === "visualStyle" ? "style" : "business");
      return;
    }
    if (state.currentQuestionIndex > 0) {
      const prevIndex = state.currentQuestionIndex - 1;
      const prevQ = state.questions[prevIndex];
      setState((prev) => ({ ...prev, currentQuestionIndex: prevIndex }));
      setOuterStep(prevQ?.fieldKey === "visualStyle" ? "style" : "business");
    } else {
      setState((prev) => ({ ...prev, step: "INPUT" }));
      setOuterStep("business");
    }
  }

  function handleBusinessContinue() {
    if (!inputMessage.trim()) return;
    const next = smartWebsiteCreatorController.submitInitialMessage(state, inputMessage.trim(), siteLanguage);
    setState(next);
    setSelectedOptionId(null);
    setCustomAnswer("");
    advanceOuterStepFrom(next);
  }

  async function uploadFile(file: File, purpose: "website_logo" | "website_image") {
    setUploading(true);
    setUploadError(null);
    try {
      const prep = await fetch("/api/platform/website-factory/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "prepare", name: file.name, mimeType: file.type, sizeBytes: file.size, purpose }),
      }).then((r) => r.json());
      if (prep.error) throw new Error(prep.error);

      const upload = await fetch(prep.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("Upload failed — please try again.");

      const finalize = await fetch("/api/platform/website-factory/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "finalize", assetId: prep.assetId }),
      }).then((r) => r.json());
      if (finalize.error) throw new Error(finalize.error);

      if (purpose === "website_logo") setLogo(finalize.image);
      else setImages((prev) => [finalize.image, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!state.brief) return;
    setGenerating(true);
    setGenerationError(null);
    setOuterStep("generate");
    try {
      const prompt = compileMasterWebsitePrompt(state.brief);
      const res = await fetch("/api/platform/website-factory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          prompt,
          websiteType: state.brief.websiteType?.value,
          businessName: state.brief.businessName?.value,
          logoUrl: logo?.url ?? undefined,
          imageUrls: images.map((i) => i.url).filter(Boolean),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setGenerationError(body.error ?? "Couldn't build your website. Please try again.");
        return;
      }
      const project = body.project as { id: string; name: string; slug: string; custom_domain?: string | null };
      setCreatedProject({ id: project.id, name: project.name, slug: project.slug, previewUrl: body.previewUrl, custom_domain: project.custom_domain });
      window.sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${tenantId}`);
      setOuterStep("review");
    } catch {
      setGenerationError("Network error — please check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  const websiteName = createdProject?.name || state.brief?.businessName?.value || tenantName || "New Website";
  const activeStepIndex = STEP_ORDER.indexOf(outerStep);
  const progressPercent = Math.round(((activeStepIndex + 1) / STEP_ORDER.length) * 100);

  const q = currentBusinessQuestion();

  return (
    // Same interaction pattern as the Growth Assistant workspace
    // (app/app/social/copilot/GrowthAssistantChat.tsx): a bordered card that
    // reserves the shell's known chrome height (TopCommandBar + mobile
    // bottom nav) rather than taking over the viewport, so the fixed top/
    // middle/bottom regions below stay reachable without a second,
    // competing fixed layer on top of CoreAppShell's own.
    <div className="sx-customer-app mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[420px] w-full max-w-full flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg sm:max-w-2xl md:h-[calc(100vh-9.5rem)] lg:max-w-3xl">
      {/* FIXED TOP — Back / StratXcel / name / save state */}
      <div className="flex shrink-0 items-center gap-3 border-b border-sx-border bg-sx-surface-1 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/app/website")}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border text-sx-text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sx-text-subtle">StratXcel · Website</p>
          <p className="truncate text-sm font-semibold text-sx-text">{websiteName}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-semibold ${saveState === "saved" ? "text-sx-success" : "text-sx-text-subtle"}`}>
          {createdProject ? "Published draft ✓" : saveState === "saved" ? "Saved ✓" : "Saving…"}
        </span>
      </div>

      {/* Progress */}
      <div className="shrink-0 border-b border-sx-border bg-sx-surface-1 px-4 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-sx-text-subtle">
            Step {activeStepIndex + 1} of {STEP_ORDER.length} · {STEP_LABELS[outerStep]}
          </p>
          {credits && credits.hasPlanEntitlement && (
            <p className="text-[11px] font-semibold text-sx-text-subtle">
              {credits.remaining} of {credits.limit} website build{credits.limit === 1 ? "" : "s"} left
            </p>
          )}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-sx-border">
          <div className="h-full rounded-full bg-sx-accent transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* SCROLLABLE MIDDLE */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {credits && !credits.hasPlanEntitlement && outerStep === "business" && (
          <div className="mb-5 rounded-sx-md border border-sx-border bg-sx-surface-2 px-3.5 py-2.5 text-xs text-sx-text-muted">
            Website builds are free while StratXcel is in early access — each build below uses 1 website credit once billing is enabled.
          </div>
        )}

        {outerStep === "business" && !q && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-bold text-sx-text">Tell us about your business</h1>
              <p className="mt-1 text-xs text-sx-text-muted">Apni business ke baare mein bataiye — Hindi, Hinglish ya English mein likhein.</p>
            </div>
            <textarea
              rows={5}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="e.g. Meri clothing shop hai, premium website bana do jo customers ko WhatsApp pe enquiry karne ke liye motivate kare..."
              className="w-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 text-sm text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none focus:ring-1 focus:ring-sx-accent"
            />
            <div className="flex flex-wrap gap-2">
              {[
                "Meri clothing shop hai, premium website bana do.",
                "Mujhe restaurant ke liye website chahiye.",
                "Meri coaching institute ke liye lead generation website chahiye.",
              ].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setInputMessage(sug)}
                  className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-1.5 text-left text-xs text-sx-text-muted hover:bg-sx-surface-3"
                >
                  {sug}
                </button>
              ))}
            </div>
            <div>
              <span className="mb-2 block text-xs font-semibold text-sx-text-muted">Website language</span>
              <div className="grid grid-cols-3 gap-2">
                {(["english", "hindi", "bilingual"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setSiteLanguage(lang)}
                    className={`rounded-sx-sm border px-3 py-2 text-xs font-semibold transition-colors ${
                      siteLanguage === lang ? "border-sx-accent bg-sx-accent-muted text-sx-accent" : "border-sx-border bg-sx-surface-2 text-sx-text-muted"
                    }`}
                  >
                    {lang === "english" ? "English" : lang === "hindi" ? "Hindi (हिंदी)" : "English + Hindi"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {outerStep === "business" && q && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-bold text-sx-text">{q.title}</h1>
              {q.explanation && <p className="mt-1 text-xs text-sx-text-muted">{q.explanation}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {q.options.map((opt) => {
                const isSelected = selectedOptionId === opt.value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedOptionId(opt.value);
                      setCustomAnswer("");
                    }}
                    className={`flex min-h-[52px] flex-col justify-center rounded-sx-md border p-3.5 text-left transition-colors ${
                      isSelected ? "border-sx-accent bg-sx-accent-muted ring-1 ring-sx-accent" : "border-sx-border bg-sx-surface-1"
                    }`}
                  >
                    <span className="text-sm font-semibold text-sx-text">{opt.label}</span>
                    {opt.subtext && <span className="text-[11px] text-sx-text-subtle">{opt.subtext}</span>}
                  </button>
                );
              })}
            </div>
            {q.allowCustomText && (
              <input
                type="text"
                value={customAnswer}
                onChange={(e) => {
                  setCustomAnswer(e.target.value);
                  setSelectedOptionId(null);
                }}
                placeholder="Other (type your own answer)…"
                className="w-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-3 text-xs text-sx-text placeholder-sx-text-subtle focus:border-sx-accent focus:outline-none"
              />
            )}
          </div>
        )}

        {outerStep === "style" && styleQuestion && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-bold text-sx-text">{styleQuestion.title}</h1>
              {styleQuestion.explanation && <p className="mt-1 text-xs text-sx-text-muted">{styleQuestion.explanation}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {styleQuestion.options.map((opt) => {
                const isSelected = selectedOptionId === opt.value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedOptionId(opt.value)}
                    className={`flex min-h-[64px] flex-col justify-center rounded-sx-md border p-3.5 text-left transition-colors ${
                      isSelected ? "border-sx-accent bg-sx-accent-muted ring-1 ring-sx-accent" : "border-sx-border bg-sx-surface-1"
                    }`}
                  >
                    <span className="text-sm font-semibold text-sx-text">{opt.label}</span>
                    {opt.subtext && <span className="text-[11px] text-sx-text-subtle">{opt.subtext}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {outerStep === "images" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-bold text-sx-text">Add logo / images</h1>
              <p className="mt-1 text-xs text-sx-text-muted">Optional — StratXcel will design great imagery automatically if you skip this.</p>
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-sx-text-muted">Logo</span>
              {logo?.url ? (
                <div className="flex items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
                  <img src={logo.url} alt="Logo" className="h-12 w-12 rounded-sx-sm object-contain bg-sx-surface-2" />
                  <span className="flex-1 truncate text-xs text-sx-text-muted">{logo.name}</span>
                  <button type="button" onClick={() => setLogo(null)} className="text-xs font-semibold text-sx-danger">Remove</button>
                </div>
              ) : (
                <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-sx-md border border-dashed border-sx-border bg-sx-surface-1 text-xs text-sx-text-subtle">
                  {uploading ? "Uploading…" : "Tap to upload your logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(file, "website_logo");
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold text-sx-text-muted">Photos ({images.length})</span>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-sx-sm border border-sx-border bg-sx-surface-2">
                    {img.url && <img src={img.url} alt={img.name} className="h-full w-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-sx-sm border border-dashed border-sx-border text-[10px] text-sx-text-subtle">
                  {uploading ? "…" : "+ Add"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(file, "website_image");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            {uploadError && <p className="text-xs text-sx-danger">{uploadError}</p>}
          </div>
        )}

        {(outerStep === "generate") && state.summary && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-bold text-sx-text">Your website plan</h1>
              <p className="mt-1 text-xs text-sx-text-muted">Review the details below, then generate your website.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 text-xs sm:grid-cols-2">
              <div><span className="block text-sx-text-subtle">Business</span><span className="text-sm font-semibold text-sx-text">{state.summary.brandName}</span></div>
              <div><span className="block text-sx-text-subtle">Goal</span><span className="text-sm font-semibold text-sx-accent">{state.summary.primaryGoal}</span></div>
              <div><span className="block text-sx-text-subtle">Audience</span><span className="font-medium text-sx-text">{state.summary.audience}</span></div>
              <div><span className="block text-sx-text-subtle">Style</span><span className="font-medium text-sx-text">{state.summary.visualStyle}</span></div>
              <div className="sm:col-span-2"><span className="block text-sx-text-subtle">Pages ({state.summary.pageList.length})</span><span className="font-medium text-sx-text">{state.summary.pageList.join(", ")}</span></div>
            </div>
            {credits && credits.hasPlanEntitlement && (
              <p className="text-xs font-semibold text-sx-text-muted">This build uses 1 website credit — {credits.remaining} remaining after.</p>
            )}
            {generating && (
              <div className="flex items-center gap-2 rounded-sx-md border border-sx-border bg-sx-surface-1 px-3.5 py-3">
                <span className="h-2 w-2 rounded-full bg-sx-accent sx-status-pulse" />
                <span className="text-[13px] text-sx-text-muted">Building your website — this takes a few seconds…</span>
              </div>
            )}
            {generationError && <p className="text-xs text-sx-danger">{generationError}</p>}
          </div>
        )}

        {outerStep === "review" && createdProject && (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="rounded-full bg-sx-success/15 px-2.5 py-0.5 text-[11px] font-bold text-sx-success">✓ Ready</span>
                <h1 className="mt-1 text-lg font-bold text-sx-text">Your website is ready</h1>
              </div>
            </div>
            <div className="min-h-[420px] flex-1 overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-2">
              <iframe title="Website preview" src={createdProject.previewUrl} className="h-full min-h-[420px] w-full" />
            </div>
          </div>
        )}

        {outerStep === "publish" && createdProject && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold text-sx-text">Publish your website</h1>
              <p className="mt-1 text-xs text-sx-text-muted">
                Production promotion requires your explicit approval, verified payment confirmation, and passing automated QA checks.
              </p>
            </div>
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 text-xs text-sx-text-muted">
              Manage your domain and go live from the Website & Domain page — your site is saved and ready whenever you are.
            </div>
          </div>
        )}
      </div>

      {/* FIXED BOTTOM */}
      <div className="shrink-0 border-t border-sx-border bg-sx-surface-1 px-4 py-3">
        {outerStep === "business" && (
          <div className="flex gap-2.5">
            {q && (
              <button
                type="button"
                onClick={handleBack}
                className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
            )}
            <button
              type="button"
              disabled={q ? !selectedOptionId && !customAnswer.trim() : !inputMessage.trim()}
              onClick={() => (q ? answerCurrent({ selectedOptionId: selectedOptionId || undefined, customText: customAnswer.trim() || undefined }) : handleBusinessContinue())}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on disabled:opacity-40"
            >
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {outerStep === "style" && styleQuestion && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              disabled={!selectedOptionId}
              onClick={() => answerCurrent({ selectedOptionId: selectedOptionId || undefined })}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on disabled:opacity-40"
            >
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {outerStep === "images" && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setOuterStep("generate")}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
            >
              {logo || images.length > 0 ? "Continue" : "Skip for now"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {outerStep === "generate" && (
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={generating}
              onClick={() => setOuterStep("images")}
              className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-sx-md border-[1.5px] border-sx-border disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-muted)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on disabled:opacity-70"
            >
              {generating ? "Generating…" : "Generate website"}
            </button>
          </div>
        )}

        {outerStep === "review" && createdProject && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => router.push(`/app/website?focus=${createdProject.id}`)}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md border-[1.5px] border-sx-border text-[14px] font-bold text-sx-text"
            >
              Edit details
            </button>
            <button
              type="button"
              onClick={() => setOuterStep("publish")}
              className="flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
            >
              Continue to publish
            </button>
          </div>
        )}

        {outerStep === "publish" && createdProject && (
          <button
            type="button"
            onClick={() => router.push(`/app/website?focus=${createdProject.id}`)}
            className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-sx-md bg-sx-accent text-[16px] font-bold text-sx-accent-on"
          >
            Go to domain & publish settings
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
