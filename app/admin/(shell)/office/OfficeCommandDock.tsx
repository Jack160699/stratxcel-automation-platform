"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Bot,
  Check,
  AlertCircle,
  Loader2,
  X,
  Zap,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { sendAdminCopilotMessageAction } from "../copilot/actions";

interface OfficeCommandDockProps {
  tenantId?: string;
  onCommandSubmitted: (commandText: string) => void;
  onRefreshTelemetry: () => void;
  isAmbientMode?: boolean;
}

type DockMode = "IDLE" | "FOCUS" | "RUNNING" | "COMPLETE" | "ERROR";

interface ExecutionResult {
  replyText: string;
  missionId?: string;
  tasksCount?: number;
  taskLabels?: string[];
  actionButtons?: Array<{ id: string; title: string }>;
}

const QUICK_COMMANDS = [
  "Register company offer for foreign university admissions",
  "Find 100 qualified solar leads for Solara Energy",
  "Launch autonomous revenue mission",
  "Generate pro forma financial spreadsheet",
  "Audit revenue and employee performance",
  "Update our SEO and get leads.",
  "Launch an SEO agent for this business.",
  "Show CEO Hermes and executive leadership status",
];

export function OfficeCommandDock({
  tenantId,
  onCommandSubmitted,
  onRefreshTelemetry,
  isAmbientMode = false,
}: OfficeCommandDockProps) {
  const router = useRouter();
  const [mode, setMode] = useState<DockMode>("IDLE");
  const [input, setInput] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [liveStatusText, setLiveStatusText] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close FOCUS mode when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        mode === "FOCUS" &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setMode("IDLE");
      }
    }
    if (mode === "FOCUS") {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mode]);

  // Handle ESC key to dismiss
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode === "FOCUS" || mode === "COMPLETE" || mode === "ERROR") {
          setMode("IDLE");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  // Focus input when entering FOCUS mode
  useEffect(() => {
    if (mode === "FOCUS") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  const dispatchCommand = useCallback(
    (commandText: string) => {
      const trimmed = commandText.trim();
      if (!trimmed || isPending) return;

      const lower = trimmed.toLowerCase();
      setLastCommand(trimmed);
      onCommandSubmitted(trimmed);

      // Determine truthful live status message based on intent decomposition
      let initialStatus = `Hermes is dispatching: "${trimmed.slice(0, 32)}..."`;
      if (lower.includes("seo") && (lower.includes("lead") || lower.includes("pipeline"))) {
        initialStatus = "Got it. I'm working on SEO and lead opportunities.";
      } else if (lower.includes("seo") || lower.includes("keyword") || lower.includes("search")) {
        initialStatus = "Got it. Launching autonomous SEO agent with Aether...";
      } else if (lower.includes("lead") || lower.includes("crm") || lower.includes("client")) {
        initialStatus = "Got it. Mercury is searching for high-intent qualified leads...";
      } else if (lower.includes("website") || lower.includes("site") || lower.includes("page")) {
        initialStatus = "Got it. Vulcan is designing website architecture...";
      } else if (lower.includes("content") || lower.includes("post") || lower.includes("social")) {
        initialStatus = "Got it. Calliope is staging multi-channel content drafts...";
      } else if (lower.includes("competitor") || lower.includes("research")) {
        initialStatus = "Got it. Argus & Athena are conducting market research...";
      } else if (lower.includes("plan") || lower.includes("month") || lower.includes("growth")) {
        initialStatus = "Got it. Formulating 30-day autonomous growth trajectory...";
      } else if (lower.includes("team") || lower.includes("status") || lower.includes("working")) {
        initialStatus = "Querying live worker telemetry and active missions...";
      }

      setLiveStatusText(initialStatus);
      setInput("");
      // Immediately collapse input so workers and desks are NEVER covered
      setMode("RUNNING");

      startTransition(async () => {
        try {
          const res = await sendAdminCopilotMessageAction(trimmed, tenantId);
          if ("error" in res) {
            setErrorMessage(res.error);
            setMode("ERROR");
          } else {
            setExecutionResult({
              replyText: res.replyText,
              missionId: res.missionId,
              tasksCount: res.tasksCount,
              taskLabels: res.taskLabels,
              actionButtons: res.actionButtons,
            });
            setMode("COMPLETE");
            onRefreshTelemetry();
          }
        } catch (err: any) {
          setErrorMessage(err.message || "Execution encountered an unexpected error");
          setMode("ERROR");
        }
      });
    },
    [isPending, onCommandSubmitted, onRefreshTelemetry, tenantId]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatchCommand(input);
  }

  function handleQuickClick(cmd: string) {
    setInput(cmd);
    dispatchCommand(cmd);
  }

  function handleActionButtonClick(button: { id: string; title: string }) {
    if (button.id === "action:seo:report") {
      router.push("/admin/missions");
    } else if (button.id === "action:crm:leads" || button.id === "action:leads:discover") {
      router.push("/admin/leads");
    } else if (button.id === "action:website:preview") {
      window.open(
        "https://solara-solara-green-mttv01s8-p6orpkoss-jack160699s-projects.vercel.app",
        "_blank"
      );
    } else if (button.id === "action:content:review") {
      router.push("/admin/social");
    } else if (button.id === "action:continue") {
      setMode("IDLE");
      setExecutionResult(null);
    } else if (button.id === "action:growth:view") {
      router.push("/admin/missions");
    } else {
      // Default: dismiss complete card
      setMode("IDLE");
      setExecutionResult(null);
    }
  }

  if (isAmbientMode) return null;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end transition-all duration-300 select-none"
    >
      {/* 1. RUNNING STATE: Sleek, non-intrusive status pill */}
      {mode === "RUNNING" && (
        <div className="mb-2 flex max-w-md items-center gap-3 rounded-2xl border border-cyan-500/40 bg-slate-950/95 px-4 py-2.5 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2">
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-bold tracking-wider text-cyan-300">
                HERMES ORCHESTRATING
              </span>
              <span className="h-1 w-1 rounded-full bg-cyan-400" />
              <span className="text-[10px] text-slate-400">Working</span>
            </div>
            <p className="truncate text-xs font-medium text-slate-200">
              {liveStatusText}
            </p>
          </div>
        </div>
      )}

      {/* 2. COMPLETE STATE: Executive Result Card + Action Buttons */}
      {mode === "COMPLETE" && executionResult && (
        <div className="mb-2 w-80 sm:w-[420px] rounded-2xl border border-emerald-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2 text-emerald-400">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check className="h-3 w-3 stroke-[3]" />
              </div>
              <span className="font-mono text-xs font-bold tracking-wider text-emerald-300">
                HERMES EXECUTION COMPLETE
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("IDLE");
                setExecutionResult(null);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Formatted Executive Output */}
          <div className="mb-3.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-line font-sans">
            {executionResult.replyText}
          </div>

          {/* Interactive Action Buttons */}
          {executionResult.actionButtons && executionResult.actionButtons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
              {executionResult.actionButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleActionButtonClick(btn)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                    btn.id.includes("continue")
                      ? "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                      : "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-white shadow-sm"
                  }`}
                >
                  <span>{btn.title}</span>
                  {!btn.id.includes("continue") && (
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setExecutionResult(null);
                  setMode("FOCUS");
                }}
                className="ml-auto flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Sparkles className="h-3 w-3 text-cyan-400" />
                <span>New Command</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. ERROR STATE: Concise error with retry */}
      {mode === "ERROR" && (
        <div className="mb-2 w-80 sm:w-96 rounded-2xl border border-rose-500/40 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-2 flex items-center justify-between border-b border-rose-500/20 pb-2">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="h-4 w-4" />
              <span className="font-mono text-xs font-bold tracking-wider">
                EXECUTION BLOCKED
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("IDLE");
                setErrorMessage(null);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-3 text-xs text-rose-200/90 leading-normal">
            {errorMessage || "The requested operation could not be completed."}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("IDLE");
                setErrorMessage(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              Dismiss
            </button>
            {lastCommand && (
              <button
                type="button"
                onClick={() => dispatchCommand(lastCommand)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-md hover:bg-rose-500 active:scale-95 transition-all"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Retry Command</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. FOCUS STATE: Expanded Command Console (Pops upward) */}
      {mode === "FOCUS" && (
        <div className="mb-2 w-80 sm:w-[420px] rounded-2xl border border-white/20 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <Bot className="h-4 w-4" />
              <span className="font-mono text-xs font-bold tracking-wider text-slate-200">
                HERMES EXECUTIVE COMMAND
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMode("IDLE")}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              title="Close (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Action Chips */}
          <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleQuickClick(cmd)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-all truncate max-w-[200px]"
                title={cmd}
              >
                {cmd}
              </button>
            ))}
          </div>

          {/* Command Form */}
          <form onSubmit={handleSubmit} className="relative flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Hermes to act… (e.g. Update our SEO and get leads.)"
              disabled={isPending}
              className="flex-1 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:bg-white/[0.08] focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0"
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
      )}

      {/* 5. IDLE STATE: Sleek corner pill (Never covers workers) */}
      {mode === "IDLE" && (
        <button
          type="button"
          onClick={() => setMode("FOCUS")}
          className="group flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 px-4 py-2 text-xs font-medium text-slate-300 backdrop-blur-xl shadow-2xl hover:border-cyan-400/50 hover:bg-slate-900/95 hover:text-white transition-all active:scale-95"
          aria-label="Open Hermes executive command console"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 group-hover:scale-110 transition-transform">
            <Zap className="h-3 w-3 fill-cyan-400 text-cyan-400" />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-wider text-cyan-300">
            HERMES
          </span>
          <span className="text-slate-400 font-normal">· Ask to act…</span>
        </button>
      )}
    </div>
  );
}
