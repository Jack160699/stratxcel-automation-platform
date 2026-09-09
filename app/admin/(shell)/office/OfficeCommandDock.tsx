"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { ArrowUp, Sparkles, Bot, Check, AlertCircle, Loader2, X } from "lucide-react";
import { sendAdminCopilotMessageAction } from "../copilot/actions";

interface OfficeCommandDockProps {
  onCommandSubmitted: (commandText: string) => void;
  onRefreshTelemetry: () => void;
  isAmbientMode?: boolean;
}

const QUICK_COMMANDS = [
  "Launch SEO agent for Solara Energy",
  "Build a modern website for this client",
  "Create 5 social posts for next week",
  "Check fleet heartbeats & queues",
];

export function OfficeCommandDock({
  onCommandSubmitted,
  onRefreshTelemetry,
  isAmbientMode = false,
}: OfficeCommandDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    onCommandSubmitted(trimmed);
    setToastMessage({
      text: `Hermes executing: "${trimmed.slice(0, 35)}..."`,
      type: "info",
    });
    setInput("");
    setIsOpen(false); // Immediately collapse so workers are never covered!

    startTransition(async () => {
      try {
        const res = await sendAdminCopilotMessageAction(trimmed);
        if ("error" in res) {
          setToastMessage({
            text: `Command error: ${res.error}`,
            type: "error",
          });
        } else {
          setToastMessage({
            text: res.replyText.slice(0, 120) + (res.replyText.length > 120 ? "..." : ""),
            type: "success",
          });
          onRefreshTelemetry();
        }
      } catch (err: any) {
        setToastMessage({
          text: `Execution failed: ${err.message}`,
          type: "error",
        });
      }
      setTimeout(() => setToastMessage(null), 5000);
    });
  }

  function handleQuickClick(cmd: string) {
    setInput(cmd);
  }

  if (isAmbientMode) return null;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end transition-all duration-300 select-none"
    >
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div
          className={`mb-2 flex max-w-sm items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === "success"
              ? "border border-emerald-500/30 bg-emerald-950/90 text-emerald-200"
              : toastMessage.type === "error"
              ? "border border-rose-500/30 bg-rose-950/90 text-rose-200"
              : "border border-cyan-500/30 bg-slate-900/95 text-cyan-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : toastMessage.type === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400 shrink-0" />
          )}
          <span className="truncate">{toastMessage.text}</span>
        </div>
      )}

      {/* Expanded Command Console (Pops upward when open) */}
      {isOpen ? (
        <div className="mb-2 w-80 sm:w-96 rounded-2xl border border-white/20 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <Bot className="h-4 w-4" />
              <span className="font-mono text-xs font-bold tracking-wider text-slate-200">
                HERMES ORCHESTRATOR
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Action Chips */}
          <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleQuickClick(cmd)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/10 hover:text-white transition-all truncate max-w-[180px]"
              >
                {cmd}
              </button>
            ))}
          </div>

          {/* Command Form */}
          <form onSubmit={handleSubmit} className="relative flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Hermes to act… (e.g. Launch SEO agent)"
              disabled={isPending}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Send command"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
              )}
            </button>
          </form>
        </div>
      ) : null}

      {/* Default Collapsed Pill: Tiny, Sleek, Safe Corner Placement */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 px-3.5 py-2 text-xs font-medium text-slate-300 backdrop-blur-xl shadow-2xl hover:border-cyan-400/50 hover:bg-slate-900/95 hover:text-white transition-all active:scale-95"
        aria-label="Open Hermes command console"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
          <Bot className="h-3 w-3" />
        </span>
        <span className="font-mono text-[11px] font-bold tracking-wider text-cyan-300">
          HERMES
        </span>
        <span className="text-slate-400 font-normal">· Ask to act…</span>
      </button>
    </div>
  );
}
