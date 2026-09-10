"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { ErrorState } from "@/components/ui/Feedback";
import {
  Inbox,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Zap,
  Wrench,
  TrendingUp,
  Check,
  X,
  ExternalLink,
  Lock,
  DollarSign,
} from "lucide-react";
import type {
  FounderInboxSummary,
  FounderNotificationCategory,
  FounderRequirementObject,
} from "@/lib/notifications/founder-notification-service";

export default function FounderInboxPage() {
  const [data, setData] = useState<FounderInboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/founder-requirements");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load inbox (HTTP ${res.status})`);
      }
      const json: FounderInboxSummary = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load Founder Inbox");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleDismissOrResolve(requirementId: string) {
    setResolvingId(requirementId);
    try {
      const res = await fetch("/api/platform/founder-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId, action: "DISMISS" }),
      });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          const filtered = prev.requirements.filter((r) => r.requirement_id !== requirementId);
          return {
            ...prev,
            requirements: filtered,
            unreadCount: Math.max(0, prev.unreadCount - 1),
          };
        });
      }
    } finally {
      setResolvingId(null);
    }
  }

  const filteredRequirements = useMemo(() => {
    if (!data) return [];
    if (selectedCategory === "ALL") return data.requirements;
    return data.requirements.filter((r) => r.type === selectedCategory);
  }, [data, selectedCategory]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Founder OS / Command Inbox"
        title="Founder Command & Notification Center"
        description="Real-time requirements, high-risk approval gates, autonomous system repairs, and business opportunities."
        actions={
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        }
      />

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Metric Banners */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5">
          <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">Action Required</span>
          <span className="text-xl sm:text-2xl font-bold text-rose-200 mt-1 block">
            {data?.unreadCount || 0}
          </span>
          <span className="text-[10px] text-rose-400/80 block mt-0.5">Direct Founder Intervention</span>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
          <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">Spend & Auth</span>
          <span className="text-xl sm:text-2xl font-bold text-amber-200 mt-1 block">
            {data?.categories.APPROVAL || 0}
          </span>
          <span className="text-[10px] text-amber-400/80 block mt-0.5">Pending Approvals</span>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3.5">
          <span className="text-[10px] uppercase font-bold text-red-400 block tracking-wider">Active Blockers</span>
          <span className="text-xl sm:text-2xl font-bold text-red-200 mt-1 block">
            {data?.categories.BLOCKED || 0}
          </span>
          <span className="text-[10px] text-red-400/80 block mt-0.5">External & Customer Handoffs</span>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5">
          <span className="text-[10px] uppercase font-bold text-cyan-400 block tracking-wider">Opportunities</span>
          <span className="text-xl sm:text-2xl font-bold text-cyan-200 mt-1 block">
            {data?.categories.OPPORTUNITY || 0}
          </span>
          <span className="text-[10px] text-cyan-400/80 block mt-0.5">High-Fit Prospect Matches</span>
        </div>

        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3.5">
          <span className="text-[10px] uppercase font-bold text-purple-400 block tracking-wider">Autonomous Repairs</span>
          <span className="text-xl sm:text-2xl font-bold text-purple-200 mt-1 block">
            {data?.categories.SYSTEM_REPAIR || 0}
          </span>
          <span className="text-[10px] text-purple-400/80 block mt-0.5">Self-Healed Workers</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSegmentedControl
          value={selectedCategory}
          onChange={setSelectedCategory}
          options={[
            { value: "ALL", label: "All Items", badge: data?.requirements.length },
            { value: "APPROVAL", label: "Approvals", badge: data?.categories.APPROVAL },
            { value: "BLOCKED", label: "Blockers", badge: data?.categories.BLOCKED },
            { value: "OPPORTUNITY", label: "Opportunities", badge: data?.categories.OPPORTUNITY },
            { value: "SYSTEM_REPAIR", label: "Repairs", badge: data?.categories.SYSTEM_REPAIR },
            { value: "COMPLETED", label: "Completed", badge: data?.categories.COMPLETED },
          ]}
        />
      </div>

      {/* Requirements List */}
      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 rounded-xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
          ))}
        </div>
      ) : filteredRequirements.length === 0 ? (
        <AdminEmptyState
          icon={<CheckCircle2 size={24} className="text-emerald-400" />}
          title="Zero pending founder actions"
          description="Hermes, specialists, and autonomous background workers are executing cleanly without blockers."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRequirements.map((req) => {
            const isCritical = req.priority === "CRITICAL";
            const isHigh = req.priority === "HIGH";

            return (
              <div
                key={req.requirement_id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-sx-border/80 bg-sx-surface-1 p-4 shadow-xs hover:border-sx-border transition-all"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${
                      req.type === "APPROVAL"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : req.type === "BLOCKED"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : req.type === "SYSTEM_REPAIR"
                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                        : req.type === "OPPORTUNITY"
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {req.type === "APPROVAL" ? (
                      <DollarSign size={16} />
                    ) : req.type === "BLOCKED" ? (
                      <AlertTriangle size={16} />
                    ) : req.type === "SYSTEM_REPAIR" ? (
                      <Wrench size={16} />
                    ) : req.type === "OPPORTUNITY" ? (
                      <Sparkles size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-sx-text-muted">
                        {req.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sx-text-muted/40">•</span>
                      <span
                        className={`rounded-full px-2 py-0.2 text-[10px] font-semibold uppercase ${
                          isCritical
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : isHigh
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {req.priority}
                      </span>
                      <span className="text-sx-text-muted/40">•</span>
                      <span className="font-mono text-[11px] text-sx-text-muted">
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-sx-text">{req.message}</h3>

                    <p className="text-xs text-sx-text-muted leading-relaxed">
                      <span className="font-semibold text-sx-text-subtle">Why Needed: </span>
                      {req.why_needed}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {req.action.targetUrl && (
                    <Link
                      href={req.action.targetUrl}
                      className="flex items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on transition hover:bg-sx-accent-hover"
                    >
                      <span>{req.action.label}</span>
                      <ArrowRight size={13} />
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDismissOrResolve(req.requirement_id)}
                    disabled={resolvingId === req.requirement_id}
                    className="flex items-center gap-1 rounded-lg border border-sx-border/70 bg-sx-surface-2 px-2.5 py-1.5 text-xs text-sx-text-muted hover:text-sx-text hover:bg-sx-surface-1 transition"
                    title="Dismiss or Acknowledge"
                  >
                    <Check size={12} className={resolvingId === req.requirement_id ? "animate-spin" : ""} />
                    <span>Acknowledge</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
