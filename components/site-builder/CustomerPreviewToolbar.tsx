"use client";

import { useState } from "react";
import type { BrowserQAResult } from "@stratxcel/websites-and-domains";

interface CustomerPreviewToolbarProps {
  projectName: string;
  version: number;
  availableVersions?: number[];
  onSelectVersion?: (version: number) => void;
  qaResult?: BrowserQAResult;
  viewport: "375px" | "768px" | "1024px" | "1440px";
  onChangeViewport: (vp: "375px" | "768px" | "1024px" | "1440px") => void;
  onPublish?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onAutoFix?: () => void;
  isPublishing?: boolean;
  isAutoFixing?: boolean;
}

export function CustomerPreviewToolbar({
  projectName,
  version,
  availableVersions = [1],
  onSelectVersion,
  qaResult,
  viewport,
  onChangeViewport,
  onPublish,
  onEdit,
  onRegenerate,
  onAutoFix,
  isPublishing = false,
  isAutoFixing = false,
}: CustomerPreviewToolbarProps) {
  const [showQADetails, setShowQADetails] = useState(false);

  const qaSummary = qaResult?.customerFacingSummary || {
    state: "good" as const,
    title: "Quality Checks Passed",
    description: "Your website is verified and ready for review.",
    canPublish: true,
    canAutoFix: false,
  };

  const statusBadge =
    qaSummary.state === "good" ? (
      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        QA Passed (Score: {qaResult?.score || 100}%)
      </span>
    ) : qaSummary.state === "warning" ? (
      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        QA Warning ({qaResult?.warnings.length} items)
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
        QA Blocked
      </span>
    );

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0d111a]/95 backdrop-blur-md border-b border-white/10 px-4 py-3 text-white">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Project & Version Info */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-bold text-sm text-white flex items-center gap-2">
              {projectName}
              <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-[11px] font-mono">
                v{version}
              </span>
            </span>
            <span className="text-[11px] text-white/50">Customer Preview Mode</span>
          </div>

          {/* QA Status Pill (Clickable) */}
          <button
            onClick={() => setShowQADetails(!showQADetails)}
            className="hover:opacity-80 transition cursor-pointer"
            title="Click to view QA check details"
          >
            {statusBadge}
          </button>
        </div>

        {/* Viewport Switcher */}
        <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => onChangeViewport("375px")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              viewport === "375px" ? "bg-amber-500 text-black font-bold" : "text-white/60 hover:text-white"
            }`}
          >
            📱 375px
          </button>
          <button
            onClick={() => onChangeViewport("768px")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              viewport === "768px" ? "bg-amber-500 text-black font-bold" : "text-white/60 hover:text-white"
            }`}
          >
            Tablet 768px
          </button>
          <button
            onClick={() => onChangeViewport("1024px")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              viewport === "1024px" ? "bg-amber-500 text-black font-bold" : "text-white/60 hover:text-white"
            }`}
          >
            Desktop 1024px
          </button>
          <button
            onClick={() => onChangeViewport("1440px")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              viewport === "1440px" ? "bg-amber-500 text-black font-bold" : "text-white/60 hover:text-white"
            }`}
          >
            Wide 1440px
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {qaSummary.canAutoFix && onAutoFix && (
            <button
              onClick={onAutoFix}
              disabled={isAutoFixing}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold transition"
            >
              {isAutoFixing ? "Auto-Repairing…" : "🪄 Fix Automatically"}
            </button>
          )}

          {onEdit && (
            <button
              onClick={onEdit}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
            >
              Make Changes
            </button>
          )}

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
            >
              Regenerate
            </button>
          )}

          {onPublish && (
            <button
              onClick={onPublish}
              disabled={!qaSummary.canPublish || isPublishing}
              className="px-5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs transition shadow-md"
            >
              {isPublishing ? "Publishing…" : "Publish Website 🚀"}
            </button>
          )}
        </div>
      </div>

      {/* QA Details Dropdown Drawer */}
      {showQADetails && qaResult && (
        <div className="mt-3 p-4 rounded-xl bg-[#141926] border border-white/10 max-w-7xl mx-auto text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <h4 className="font-bold text-white text-sm">{qaSummary.title}</h4>
              <p className="text-white/60 text-[11px]">{qaSummary.description}</p>
            </div>
            <button
              onClick={() => setShowQADetails(false)}
              className="text-white/50 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pt-1">
            {qaResult.checks.map((chk) => (
              <div
                key={chk.id}
                className={`p-2.5 rounded-lg border text-[11px] ${
                  chk.status === "PASSED"
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                    : chk.status === "WARNING"
                    ? "bg-amber-500/5 border-amber-500/20 text-amber-300"
                    : "bg-rose-500/5 border-rose-500/20 text-rose-300"
                }`}
              >
                <div className="font-semibold">{chk.name}</div>
                <div className="text-white/50 text-[10px] mt-0.5">{chk.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
