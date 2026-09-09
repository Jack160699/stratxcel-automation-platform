"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Sparkles, Bot, Check, AlertCircle, Loader2 } from "lucide-react";
import { sendAdminCopilotMessageAction } from "../copilot/actions";

interface HermesCommandBarProps {
  onCommandSubmitted: (commandText: string) => void;
  onRefreshTelemetry: () => void;
}

const SUGGESTED_COMMANDS = [
  "Show me what everyone is working on.",
  "Launch an SEO agent for Solara Energy.",
  "Create 5 social posts for next week.",
  "Check live worker heartbeats and queue status.",
];

export function HermesCommandBar({
  onCommandSubmitted,
  onRefreshTelemetry,
}: HermesCommandBarProps) {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [acknowledgement, setAcknowledgement] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    onCommandSubmitted(trimmed);
    setInput("");

    startTransition(async () => {
      try {
        const res = await sendAdminCopilotMessageAction(trimmed);
        if ("error" in res) {
          setAcknowledgement({
            text: `Command error: ${res.error}`,
            type: "error",
          });
        } else {
          setAcknowledgement({
            text: res.replyText.slice(0, 160) + (res.replyText.length > 160 ? "..." : ""),
            type: "success",
          });
          onRefreshTelemetry();
        }
      } catch (err: any) {
        setAcknowledgement({
          text: `Execution failed: ${err.message}`,
          type: "error",
        });
      }
      setTimeout(() => setAcknowledgement(null), 8000);
    });
  }

  function handleSuggestedClick(cmd: string) {
    setInput(cmd);
  }

  return (
    <div className="relative z-20 flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/85 p-3.5 backdrop-blur-2xl shadow-2xl transition-all">
      {/* Acknowledgement Banner */}
      {acknowledgement && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
            acknowledgement.type === "success"
              ? "border border-indigo-500/30 bg-indigo-950/60 text-indigo-200"
              : "border border-rose-500/30 bg-rose-950/60 text-rose-200"
          }`}
        >
          {acknowledgement.type === "success" ? (
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span className="truncate">{acknowledgement.text}</span>
        </div>
      )}

      {/* Suggested Command Chips */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="flex items-center gap-1 text-slate-500 font-semibold uppercase tracking-wider text-[10px] pl-1">
          <Sparkles className="h-3 w-3 text-amber-400" />
          Direct:
        </span>
        {SUGGESTED_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => handleSuggestedClick(cmd)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all active:scale-95 whitespace-nowrap"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Executive Command Input Form */}
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <div className="flex items-center gap-2 pl-3 pr-2 text-slate-400">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <span className="font-mono text-xs font-bold text-slate-300 tracking-wider">HERMES</span>
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Hermes to act... (e.g. Launch an SEO agent, create posts, verify workers)"
          disabled={isPending}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:bg-white/[0.07] focus:outline-none transition-all"
        />

        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          aria-label="Send command to Hermes"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <ArrowUp className="h-4 w-4 stroke-[2.5]" />
          )}
        </button>
      </form>
    </div>
  );
}
