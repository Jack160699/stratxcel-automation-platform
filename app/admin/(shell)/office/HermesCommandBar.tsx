"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Sparkles, Bot, Check, AlertCircle, Loader2 } from "lucide-react";
import { sendAdminCopilotMessageAction } from "../copilot/actions";

interface HermesCommandBarProps {
  onCommandSubmitted: (commandText: string) => void;
  onRefreshTelemetry: () => void;
  isAmbientMode?: boolean;
}

const QUICK_ACTIONS = [
  "Launch SEO agent for Solara Energy",
  "Build a modern website for this client",
  "Create 5 social posts for next week",
  "Check live worker heartbeats",
];

export function HermesCommandBar({
  onCommandSubmitted,
  onRefreshTelemetry,
  isAmbientMode = false,
}: HermesCommandBarProps) {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    onCommandSubmitted(trimmed);
    setStatusMessage({
      text: `Hermes executing: "${trimmed}"...`,
      type: "info",
    });
    setInput("");

    startTransition(async () => {
      try {
        const res = await sendAdminCopilotMessageAction(trimmed);
        if ("error" in res) {
          setStatusMessage({
            text: `Command error: ${res.error}`,
            type: "error",
          });
        } else {
          setStatusMessage({
            text: res.replyText.slice(0, 140) + (res.replyText.length > 140 ? "..." : ""),
            type: "success",
          });
          onRefreshTelemetry();
        }
      } catch (err: any) {
        setStatusMessage({
          text: `Execution failed: ${err.message}`,
          type: "error",
        });
      }
      setTimeout(() => setStatusMessage(null), 6000);
    });
  }

  function handleActionClick(cmd: string) {
    setInput(cmd);
    setIsFocused(true);
  }

  if (isAmbientMode) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-30 w-full max-w-xl -translate-x-1/2 px-4 transition-all duration-500">
      {/* Realtime Status / Action Feedback Capsule */}
      {statusMessage && (
        <div
          className={`mx-auto mb-2 flex max-w-md items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
            statusMessage.type === "success"
              ? "border border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
              : statusMessage.type === "error"
              ? "border border-rose-500/30 bg-rose-950/80 text-rose-200"
              : "border border-cyan-500/30 bg-slate-900/90 text-cyan-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : statusMessage.type === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400 shrink-0" />
          )}
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Floating Executive Command Console */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/85 p-2 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-cyan-400/40">
        {/* Quick action chips visible when focused or hovering */}
        {isFocused && (
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1 pb-0.5 text-[11px] animate-in fade-in duration-200">
            <span className="text-slate-500 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-cyan-400" />
              Quick:
            </span>
            {QUICK_ACTIONS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleActionClick(cmd)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-0.5 text-slate-300 hover:bg-white/10 hover:text-white transition-all text-[10px]"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        {/* Floating Single-Line Command Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
          <div className="flex items-center gap-2 pl-3 text-cyan-400">
            <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/25">
              <Bot className="h-3 w-3" />
            </div>
            <span className="font-mono text-[11px] font-bold tracking-wider text-slate-300 hidden sm:inline">
              HERMES
            </span>
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Ask Hermes to act… (e.g. Launch SEO agent for Solara Energy)"
            disabled={isPending}
            className="flex-1 bg-transparent px-2 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Send command to Hermes"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
