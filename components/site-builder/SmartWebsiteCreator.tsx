"use client";

import { useState, useEffect } from "react";
import {
  smartWebsiteCreatorController,
  type CreatorSessionState,
  type RegenerateOptionItem,
} from "@stratxcel/websites-and-domains";
import type { AuthorizedConnectorContext, BriefVisualStyle } from "@stratxcel/websites-and-domains";
import { SiteRenderer } from "./SiteRenderer";
import { CustomerDomainManager } from "./CustomerDomainManager";

interface SmartWebsiteCreatorProps {
  tenantId: string;
  projectId?: string;
  connectorContext?: AuthorizedConnectorContext;
  onPublish?: (projectId: string, version: number) => void;
  onClose?: () => void;
}

export function SmartWebsiteCreator({
  tenantId,
  projectId,
  connectorContext,
  onPublish,
  onClose,
}: SmartWebsiteCreatorProps) {
  const [state, setState] = useState<CreatorSessionState>(() => {
    return smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
      connectorContext,
    });
  });

  const [inputMessage, setInputMessage] = useState("");
  const [siteLanguage, setSiteLanguage] = useState<"english" | "hindi" | "bilingual">("english");
  const [customAnswer, setCustomAnswer] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [customRegenText, setCustomRegenText] = useState("");
  const [activeRegenOption, setActiveRegenOption] = useState<RegenerateOptionItem | null>(null);

  // Suggestions
  const promptSuggestions = [
    "Meri clothing shop hai, premium website bana do.",
    "Mujhe restaurant ke liye website chahiye.",
    "Mere existing business data ke according website improve karo.",
    "Meri coaching institute ke liye lead generation website chahiye.",
  ];

  // Check localStorage for saved session
  useEffect(() => {
    try {
      const storageKey = `stratxcel_brief_${tenantId}_${projectId || "new"}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.step && parsed.step !== "INPUT" && parsed.step !== "READY") {
          const resumed = smartWebsiteCreatorController.initializeSession({
            tenantId,
            projectId,
            connectorContext,
            savedState: parsed,
          });
          setState(resumed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [tenantId, projectId, connectorContext]);

  // Persist session changes
  useEffect(() => {
    try {
      const storageKey = `stratxcel_brief_${tenantId}_${projectId || "new"}`;
      if (state.step === "READY" || state.step === "INPUT") {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(state));
      }
    } catch {
      // Ignore
    }
  }, [state, tenantId, projectId]);

  // Handle Initial Message Submission
  function handleInitialSubmit() {
    if (!inputMessage.trim()) return;
    const next = smartWebsiteCreatorController.submitInitialMessage(
      state,
      inputMessage.trim(),
      siteLanguage
    );
    setState(next);
    setSelectedOptionId(null);
    setCustomAnswer("");
  }

  // Handle Answering a Question
  function handleAnswerQuestion() {
    const q = state.questions[state.currentQuestionIndex];
    if (!q) return;

    const answerPayload = {
      questionId: q.id,
      selectedOptionId: selectedOptionId || undefined,
      customText: customAnswer.trim() || undefined,
    };

    const next = smartWebsiteCreatorController.answerQuestion(state, answerPayload);
    setState(next);
    setSelectedOptionId(null);
    setCustomAnswer("");
  }

  // Handle Website Generation
  async function handleStartGeneration() {
    setState((prev) => ({ ...prev, step: "GENERATING" }));

    // Advance stages with friendly visual progress
    for (let i = 0; i < state.stages.length; i++) {
      await new Promise((r) => setTimeout(r, 250));
      setState((prev) => {
        const updatedStages = prev.stages.map((s, idx) => ({
          ...s,
          isComplete: idx < i,
          isActive: idx === i,
        }));
        return { ...prev, currentStageIndex: i, stages: updatedStages };
      });
    }

    const finalState = await smartWebsiteCreatorController.generateWebsite(state);
    setState(finalState);
  }

  // Handle Regeneration
  async function handleRegenerate(option: RegenerateOptionItem) {
    setShowRegenModal(false);
    setState((prev) => ({ ...prev, step: "GENERATING" }));

    const next = await smartWebsiteCreatorController.executeRegeneration(state, {
      action: option.action,
      customInstruction: customRegenText.trim() || undefined,
      newStyle: option.styleValue,
    });
    setState(next);
    setCustomRegenText("");
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-[#0a0d14] text-white rounded-2xl border border-white/10 shadow-2xl transition-all">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            Website Factory
          </h2>
          <p className="text-xs text-white/50">Smart Brief & Instant AI Builder</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Connected Business Data Banner */}
      {state.connectorChips.length > 0 && state.step !== "READY" && (
        <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex flex-wrap items-center gap-2">
          <span className="font-semibold text-amber-400">Using your existing business data:</span>
          {state.connectorChips.map((chip, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium"
            >
              ✓ {chip}
            </span>
          ))}
        </div>
      )}

      {/* Resume Banner */}
      {state.canResume && state.step === "INPUT" && (
        <div className="mb-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-indigo-300">Welcome back!</h4>
            <p className="text-xs text-white/60">
              Your website setup is {state.completionPercentage}% complete.
            </p>
          </div>
          <button
            onClick={() => setState((prev) => ({ ...prev, step: "QUESTIONS" }))}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
          >
            Continue
          </button>
        </div>
      )}

      {/* STEP 1: CONVERSATIONAL INPUT */}
      {state.step === "INPUT" && (
        <div className="space-y-6">
          <div>
            <label className="block text-base font-semibold text-white mb-2">
              Tell us about the website you want
            </label>
            <p className="text-xs text-white/60 mb-3">
              Apni website ke baare mein bataiye — Hindi, Hinglish ya English mein likhein.
            </p>
            <textarea
              rows={4}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="e.g. Meri clothing shop hai, premium website bana do jo customers ko WhatsApp pe enquiry karne ke liye motivate kare..."
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 text-sm"
            />
          </div>

          {/* Multilingual Suggestions */}
          <div>
            <span className="text-xs font-medium text-white/50 block mb-2">Examples:</span>
            <div className="flex flex-wrap gap-2">
              {promptSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => setInputMessage(sug)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/80 border border-white/5 transition text-left"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Website Language Selection */}
          <div className="pt-2 border-t border-white/5">
            <span className="text-xs font-medium text-white/70 block mb-2">Website Language:</span>
            <div className="grid grid-cols-3 gap-2">
              {(["english", "hindi", "bilingual"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSiteLanguage(lang)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                    siteLanguage === lang
                      ? "bg-amber-500/20 border-amber-400 text-amber-300 font-bold"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {lang === "english" ? "English" : lang === "hindi" ? "Hindi (हिंदी)" : "English + Hindi"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleInitialSubmit}
              disabled={!inputMessage.trim()}
              className="w-full md:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-sm transition shadow-lg"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DYNAMIC SMART QUESTIONS */}
      {state.step === "QUESTIONS" && state.questions.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>
              Question {state.currentQuestionIndex + 1} of {state.questions.length}
            </span>
            <span className="text-amber-400 font-semibold">{state.completionPercentage}% Complete</span>
          </div>

          {/* Question Card */}
          {(() => {
            const q = state.questions[state.currentQuestionIndex];
            if (!q) return null;
            return (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">{q.title}</h3>
                  {q.explanation && <p className="text-xs text-white/60">{q.explanation}</p>}
                </div>

                {/* Option Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {q.options.map((opt) => {
                    const isSelected = selectedOptionId === opt.id || selectedOptionId === opt.value;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setSelectedOptionId(opt.value);
                          setCustomAnswer("");
                        }}
                        className={`min-h-[52px] p-3.5 rounded-xl border text-left flex flex-col justify-center transition-all ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400"
                            : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80"
                        }`}
                      >
                        <span className="font-semibold text-sm">{opt.label}</span>
                        {opt.subtext && <span className="text-[11px] text-white/50">{opt.subtext}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Other / Custom Text Input */}
                {q.allowCustomText && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={customAnswer}
                      onChange={(e) => {
                        setCustomAnswer(e.target.value);
                        setSelectedOptionId(null);
                      }}
                      placeholder="Other (type custom answer here)..."
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-400 focus:outline-none text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <button
              onClick={() => {
                if (state.currentQuestionIndex > 0) {
                  setState((prev) => ({ ...prev, currentQuestionIndex: prev.currentQuestionIndex - 1 }));
                } else {
                  setState((prev) => ({ ...prev, step: "INPUT" }));
                }
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 transition"
            >
              ← Back
            </button>

            <button
              onClick={handleAnswerQuestion}
              disabled={!selectedOptionId && !customAnswer.trim()}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs transition shadow-md"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PRE-GENERATION SUMMARY */}
      {state.step === "SUMMARY" && state.summary && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Your Website Plan</h3>
            <p className="text-xs text-white/60">
              We&apos;re ready to create your high-converting website based on your answers and business data.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-white/40 block">Business</span>
              <span className="font-semibold text-sm text-white">{state.summary.brandName}</span>
            </div>
            <div>
              <span className="text-white/40 block">Goal</span>
              <span className="font-semibold text-sm text-amber-300">{state.summary.primaryGoal}</span>
            </div>
            <div>
              <span className="text-white/40 block">Audience</span>
              <span className="font-semibold text-white">{state.summary.audience}</span>
            </div>
            <div>
              <span className="text-white/40 block">Visual Look</span>
              <span className="font-semibold text-white">{state.summary.visualStyle}</span>
            </div>
            <div>
              <span className="text-white/40 block">Pages ({state.summary.pageList.length})</span>
              <span className="font-medium text-white/80">{state.summary.pageList.join(", ")}</span>
            </div>
            <div>
              <span className="text-white/40 block">Primary Action</span>
              <span className="font-semibold text-white">{state.summary.primaryCta}</span>
            </div>
          </div>

          {state.summary.keyFeatures.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.summary.keyFeatures.map((feat, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[11px] font-medium"
                >
                  ⚡ {feat}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <button
              onClick={() => setState((prev) => ({ ...prev, step: "INPUT" }))}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 transition"
            >
              Change Answers
            </button>

            <button
              onClick={handleStartGeneration}
              className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition shadow-lg"
            >
              Generate Website →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: GENERATION PROGRESS */}
      {state.step === "GENERATING" && (
        <div className="py-8 space-y-6 text-center">
          <div className="inline-block p-4 rounded-full bg-amber-500/10 border border-amber-500/20 mb-2">
            <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>

          <h3 className="text-lg font-bold text-white">Building your website...</h3>

          <div className="max-w-md mx-auto space-y-2 text-left">
            {state.stages.map((stage) => (
              <div
                key={stage.id}
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                  stage.isComplete
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : stage.isActive
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-300 font-semibold ring-1 ring-amber-400/50"
                    : "bg-white/5 border-white/5 text-white/40"
                }`}
              >
                <span>{stage.label}</span>
                <span>{stage.isComplete ? "✓" : stage.isActive ? "..." : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 5: READY & PREVIEW */}
      {state.step === "READY" && state.generatedSite && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                ✓ Ready • Version {state.generatedSite.version}
              </span>
              <h3 className="text-xl font-bold text-white mt-1">Your website is ready</h3>
            </div>

            {/* Desktop / Mobile switcher */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 self-start">
              <button
                onClick={() => setPreviewMode("desktop")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  previewMode === "desktop" ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  previewMode === "mobile" ? "bg-amber-500 text-black" : "text-white/60 hover:text-white"
                }`}
              >
                Mobile
              </button>
            </div>
          </div>

          {/* Embedded Site Preview */}
          <div
            className={`mx-auto bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl transition-all ${
              previewMode === "mobile" ? "max-w-[375px]" : "w-full"
            }`}
          >
            <SiteRenderer project={state.generatedSite.siteModel} />
          </div>

          {/* Customer-Owned Domain Connection Flow */}
          <div className="pt-2">
            <CustomerDomainManager
              tenantId={tenantId}
              projectId={state.projectId || "prj_latest"}
              projectName={state.generatedSite.siteModel.name}
            />
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
            <button
              onClick={() => setShowRegenModal(true)}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
            >
              Generate Another Version
            </button>

            <div className="flex items-center gap-2">
              {onPublish && (
                <button
                  onClick={() => onPublish(state.projectId || "prj_latest", state.generatedSite?.version || 1)}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition shadow-md"
                >
                  Publish Website
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {state.step === "ERROR" && (
        <div className="py-8 text-center space-y-4">
          <div className="text-3xl">⚠️</div>
          <h3 className="text-lg font-bold text-rose-400">Something went wrong</h3>
          <p className="text-xs text-white/60 max-w-sm mx-auto">{state.error}</p>
          <button
            onClick={() => setState((prev) => ({ ...prev, step: "SUMMARY" }))}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
          >
            Try Again
          </button>
        </div>
      )}

      {/* REGENERATION MODAL */}
      {showRegenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 text-white shadow-2xl">
            <h3 className="text-lg font-bold">What would you like to change?</h3>
            <p className="text-xs text-white/60">
              Stratxcel will create Version {(state.generatedSite?.version || 1) + 1} while keeping your current design safe.
            </p>

            <div className="space-y-2">
              {smartWebsiteCreatorController.getRegenerationOptions().map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleRegenerate(opt)}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition"
                >
                  <span className="font-semibold text-xs text-amber-300 block">{opt.label}</span>
                  <span className="text-[11px] text-white/50">{opt.description}</span>
                </button>
              ))}
            </div>

            <div className="pt-2">
              <label className="text-xs font-medium text-white/70 block mb-1">
                Tell us what to change (optional):
              </label>
              <textarea
                rows={2}
                value={customRegenText}
                onChange={(e) => setCustomRegenText(e.target.value)}
                placeholder="e.g. Hero section mein typography aur clean karo..."
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRegenModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white/70 font-semibold"
              >
                Cancel
              </button>
              {customRegenText.trim() && (
                <button
                  onClick={() =>
                    handleRegenerate({
                      id: "custom",
                      label: "Custom Change",
                      description: customRegenText,
                      action: "custom",
                    })
                  }
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                >
                  Regenerate Version {(state.generatedSite?.version || 1) + 1}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
