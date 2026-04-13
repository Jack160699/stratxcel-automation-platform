"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS, whatsappHref } from "@/lib/constants";
import { PrimaryButton, CTAMicrocopy } from "@/app/components/marketing-ui";

const PROMPTS = [
  {
    label: "Where should we start automating?",
    reply:
      "Start where cost and volume meet: we quantify hours spent on repeatable work (support, routing, approvals). Teams often recover 20–40% of that time in the first phase—enough to fund the next wave of automation without adding headcount.",
  },
  {
    label: "How do you map our workflows?",
    reply:
      "We tie each step to time and cost: who does it, system of record, and error rate. That gives a ranked backlog—so we automate what moves margin and customer experience first, not what’s easiest to script.",
  },
  {
    label: "What does a realistic timeline look like?",
    reply:
      "A focused pilot is typically 4–8 weeks to go-live on one workflow with measurable KPIs (e.g. handle time, conversion). Full ROI visibility usually firms up after 60–90 days of stable run-rate—then we scale what’s proven.",
  },
];

const DEFAULT_REPLY =
  "We’d baseline your current cost-per-ticket or cost-per-lead, then target automation where payback is clearest—often 6–12 months on labor savings alone, before counting revenue lift. Get started and we’ll sanity-check numbers before you commit.";

function replyForTypedMessage(text) {
  const lower = text.toLowerCase();
  if (/roi|return|payback|save|cost|money|budget|revenue|margin/.test(lower)) {
    return "On similar engagements we model payback using your loaded labor rate and volume: many clients see a positive ROI on the pilot itself once manual hours drop 15–25% on the first workflow. We’ll sanity-check numbers before you commit.";
  }
  if (/time|timeline|week|month|how long|when/.test(lower)) {
    return "Expect a working pilot in roughly 4–8 weeks for one high-impact flow; broader rollout is phased so each stage has a clear ROI checkpoint—not a big-bang bet.";
  }
  if (/automate|automation|workflow|process|integrat/.test(lower)) {
    return "We prioritize by ROI: high volume × high cost-per-touch wins first. That usually means faster payback and less change-management risk than boiling the ocean.";
  }
  return DEFAULT_REPLY;
}

export function ChatDemo() {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  const scrollPanelToBottom = useCallback(() => {
    const panel = scrollRef.current;
    if (!panel) return;
    panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !pending) return;
    scrollPanelToBottom();
  }, [messages, pending, scrollPanelToBottom]);

  const pushAssistant = useCallback((replyText) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: "assistant",
        text: replyText,
      },
    ]);
    setPending(false);
  }, []);

  const handlePrompt = (prompt) => {
    if (pending) return;
    setPending(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: prompt.label },
    ]);
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: prompt.reply,
        },
      ]);
      setPending(false);
    }, 550);
  };

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
    setInput("");
    const reply = replyForTypedMessage(trimmed);
    window.setTimeout(() => {
      pushAssistant(reply);
    }, 550);
  };

  const { brand, accent } = COLORS;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
      <div className="mb-5 text-center sm:mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.2em]">
          Interactive preview
        </p>
        <h2 className="mt-2 text-pretty text-lg font-semibold leading-tight tracking-[-0.032em] text-[#0B1220] sm:mt-2.5 sm:text-2xl sm:tracking-[-0.035em]">
          See how Stratxcel AI responds
        </h2>
        <p className="mt-2 text-[13px] leading-[1.45] text-slate-500 sm:mt-2.5 sm:text-[14px] sm:leading-snug">
          Tap a suggestion or type below — demo replies only, not live data.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-[0_20px_60px_-36px_rgba(11,18,32,0.2)] backdrop-blur-xl transition-shadow duration-200 ease-out motion-safe:hover:shadow-[0_24px_64px_-32px_rgba(11,18,32,0.22)]">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100/90 bg-gradient-to-r from-slate-50/95 to-white px-3 py-3 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]" />
            </span>
            <span className="truncate text-[13px] font-semibold text-[#0B1220] sm:text-sm">
              Stratxcel AI
            </span>
          </div>
          <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-emerald-800 sm:px-2 sm:text-[10px]">
            Interactive Preview
          </span>
        </div>

        <div
          ref={scrollRef}
          className="max-h-[min(48vh,380px)] min-h-[160px] space-y-2.5 overflow-y-auto px-3 py-3 sm:min-h-[200px] sm:space-y-3 sm:px-5 sm:py-5"
        >
          {messages.length === 0 && !pending && (
            <p className="text-center text-[12px] leading-relaxed text-slate-400 sm:text-[13px]">
              Choose a prompt or type a question to preview the conversation style.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed sm:max-w-[85%] sm:px-3.5 sm:py-2.5 sm:text-[14px] ${
                  m.role === "user"
                    ? "rounded-br-md border border-slate-200/80 bg-slate-50 text-slate-800"
                    : "rounded-bl-md border border-white/20 text-white shadow-md"
                }`}
                style={
                  m.role === "assistant"
                    ? {
                        background: `linear-gradient(135deg, ${brand} 0%, ${accent} 100%)`,
                      }
                    : undefined
                }
              >
                {m.text}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200/80 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-3 sm:px-5 sm:py-4">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:mb-3 sm:text-[10px]">
            Suggested prompts
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={pending}
                onClick={() => handlePrompt(p)}
                className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-left text-[11px] font-medium leading-snug text-slate-700 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:border-slate-300/95 hover:bg-slate-50/80 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 sm:flex-1 sm:min-w-0 sm:px-3.5 sm:py-2.5 sm:text-[13px]"
              >
                {p.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSend} className="mt-2.5 sm:mt-3">
            <div className="flex items-stretch gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-2 py-1.5 transition-[box-shadow,border-color] duration-200 ease-out focus-within:border-slate-300/90 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] sm:px-3 sm:py-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything…"
                disabled={pending}
                className="min-h-[40px] flex-1 bg-transparent text-[13px] text-[#0B1220] placeholder:text-slate-400 transition-colors duration-150 ease-out focus:outline-none disabled:opacity-50 sm:text-[14px]"
                autoComplete="off"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition-[filter,transform] duration-200 ease-out hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 sm:px-3.5 sm:text-[12px]"
                style={{ backgroundColor: brand }}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center text-center sm:mt-8">
        <p className="max-w-sm text-[13px] font-medium leading-snug text-slate-600 sm:text-[15px]">
          Want this for your business?
        </p>
        <div className="mt-3 w-full max-w-xs sm:max-w-none">
          <PrimaryButton href={whatsappHref} external className="!w-full">
            Get started
          </PrimaryButton>
        </div>
        <CTAMicrocopy className="max-w-xs sm:max-w-sm">
          Opens WhatsApp · same team that scopes production systems
        </CTAMicrocopy>
      </div>
    </div>
  );
}
