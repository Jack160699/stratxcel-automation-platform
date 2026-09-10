"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell, ShieldAlert, CheckCircle2, ArrowRight, X, AlertTriangle, Sparkles } from "lucide-react";
import type { FounderInboxSummary } from "@/lib/notifications/founder-notification-service";

export function FounderNotificationBell() {
  const [data, setData] = useState<FounderInboxSummary | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function fetchSummary() {
    try {
      const res = await fetch("/api/platform/founder-requirements");
      if (res.ok) {
        const json: FounderInboxSummary = await res.json();
        setData(json);
      }
    } catch {
      // Non-blocking background fetch
    }
  }

  useEffect(() => {
    fetchSummary();
    const timer = setInterval(fetchSummary, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const unreadCount = data?.unreadCount || 0;
  const criticalCount = data?.criticalCount || 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-sx-border/80 bg-sx-surface-1 text-sx-text-muted transition hover:bg-sx-surface-2 hover:text-sx-text"
        title="Founder Notifications & Requirements"
        aria-label="Founder Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm ${
              criticalCount > 0 ? "bg-rose-500 animate-pulse" : "bg-cyan-500"
            }`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-zinc-800 bg-[#0c0e14] p-4 text-zinc-100 shadow-2xl z-50 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Founder Action OS</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/30">
                  {unreadCount} Required
                </span>
              )}
            </div>
            <Link
              href="/admin/inbox"
              onClick={() => setOpen(false)}
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>Full Inbox</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {!data || data.requirements.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                All systems operating autonomously. No founder actions required.
              </div>
            ) : (
              data.requirements.slice(0, 4).map((req) => (
                <div
                  key={req.requirement_id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-xs space-y-1 hover:border-zinc-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      req.priority === "CRITICAL" ? "text-rose-400" : req.priority === "HIGH" ? "text-amber-400" : "text-cyan-400"
                    }`}>
                      {req.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="font-medium text-zinc-200 line-clamp-2">{req.message}</p>
                  <div className="pt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 line-clamp-1">{req.why_needed}</span>
                    {req.action.targetUrl ? (
                      <Link
                        href={req.action.targetUrl}
                        onClick={() => setOpen(false)}
                        className="text-[11px] font-semibold text-cyan-400 hover:underline shrink-0 ml-2"
                      >
                        {req.action.label} →
                      </Link>
                    ) : (
                      <span className="text-[11px] font-semibold text-zinc-400">{req.action.label}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-800/80">
            <Link
              href="/admin/inbox"
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800/80 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition"
            >
              <span>Open Founder Command Inbox</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
