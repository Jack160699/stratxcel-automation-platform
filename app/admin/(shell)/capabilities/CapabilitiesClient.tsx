"use client";

import { useState, useMemo } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminUniversalDrawer, AdminDrawerSection, AdminDrawerRow } from "@/components/admin/ui/AdminUniversalDrawer";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Wrench, Search, ShieldCheck } from "lucide-react";

export interface CapabilityItem {
  capability_key: string;
  name: string | null;
  description: string | null;
  category: string | null;
  status: string;
  status_notes: string | null;
  external_blocker: string | null;
  agent_tool_name: string | null;
  last_verified_at: string | null;
  provider?: string | null;
  execution_method?: string | null;
  fallback?: string | null;
  permission?: string | null;
  requires_confirmation?: boolean;
}

const STATUS_MAP: Record<string, { label: string; status: "connected" | "needs_attention" | "waiting" | "paused" | "error" }> = {
  AVAILABLE: { label: "● Available", status: "connected" },
  AVAILABLE_WITH_CONFIRMATION: { label: "● Available (Confirmation)", status: "needs_attention" },
  REAL_EXPOSED: { label: "● Available", status: "connected" },
  AUTH_REQUIRED: { label: "● Auth Required", status: "needs_attention" },
  DEGRADED: { label: "● Degraded", status: "needs_attention" },
  UNAVAILABLE: { label: "○ Unavailable", status: "paused" },
  PARTIAL: { label: "Partial", status: "needs_attention" },
  REAL_NOT_EXPOSED: { label: "Internal Only", status: "waiting" },
  NOT_BUILT: { label: "In Roadmap", status: "paused" },
  EXTERNAL_REQUIRED: { label: "External Blocker", status: "needs_attention" },
  BROKEN: { label: "Broken", status: "error" },
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never verified";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return "Verified just now";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "Verified just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `Verified ${min} min ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `Verified ${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    return `Verified ${days}d ago`;
  } catch {
    return "Verified recently";
  }
}

type StatusFilter = "all" | "live" | "building" | "blocked";

export function CapabilitiesClient({
  capabilities,
  countsByStatus,
}: {
  capabilities: CapabilityItem[];
  countsByStatus: Record<string, number>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCapability, setSelectedCapability] = useState<CapabilityItem | null>(null);

  const liveCount = (countsByStatus["AVAILABLE"] ?? 0) + (countsByStatus["AVAILABLE_WITH_CONFIRMATION"] ?? 0) + (countsByStatus["REAL_EXPOSED"] ?? 0);
  const buildingCount = (countsByStatus["PARTIAL"] ?? 0) + (countsByStatus["NOT_BUILT"] ?? 0) + (countsByStatus["REAL_NOT_EXPOSED"] ?? 0);
  const blockedCount =
    (countsByStatus["AUTH_REQUIRED"] ?? 0) +
    (countsByStatus["EXTERNAL_REQUIRED"] ?? 0) +
    (countsByStatus["DEGRADED"] ?? 0) +
    (countsByStatus["UNAVAILABLE"] ?? 0) +
    (countsByStatus["BROKEN"] ?? 0);

  const filtered = useMemo(() => {
    return capabilities.filter((c) => {
      if (statusFilter === "live" && !["AVAILABLE", "AVAILABLE_WITH_CONFIRMATION", "REAL_EXPOSED"].includes(c.status)) {
        return false;
      }
      if (statusFilter === "building" && !["PARTIAL", "NOT_BUILT", "REAL_NOT_EXPOSED"].includes(c.status)) {
        return false;
      }
      if (
        statusFilter === "blocked" &&
        !["AUTH_REQUIRED", "EXTERNAL_REQUIRED", "BROKEN", "DEGRADED", "UNAVAILABLE"].includes(c.status)
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (c.name?.toLowerCase().includes(q) ?? false) ||
          c.capability_key.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false) ||
          (c.category?.toLowerCase().includes(q) ?? false) ||
          (c.provider?.toLowerCase().includes(q) ?? false) ||
          (c.execution_method?.toLowerCase().includes(q) ?? false) ||
          (c.fallback?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [capabilities, statusFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Brain / Capability Registry"
        title="Capability Registry"
        description="Authoritative catalog of what the Hermes Autonomous Engine and Copilot agents can execute across Google Founder Browser, API connectors, and desktop runtimes."
        actions={
          <div className="flex items-center gap-3 text-xs text-sx-text-muted">
            <span>
              Total: <b>{capabilities.length}</b>
            </span>
            <span>·</span>
            <span className="text-[#5BDCA7]">
              Available: <b>{liveCount}</b>
            </span>
            <span>·</span>
            <span className="text-[#F3C55C]">
              Pending / Blocked: <b>{blockedCount}</b>
            </span>
          </div>
        }
      />

      {/* Controls: Search & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-sx-border/70 bg-sx-surface-1 px-3 py-1.5 text-xs text-sx-text-muted w-full sm:w-72">
          <Search size={14} className="text-sx-text-subtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search capabilities, providers, or methods…"
            className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none"
          />
        </div>

        <AdminSegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All", badge: capabilities.length },
            { value: "live", label: "Available", badge: liveCount },
            {
              value: "building",
              label: "In Progress",
              badge: buildingCount,
            },
            {
              value: "blocked",
              label: "Blocked / Auth",
              badge: blockedCount,
            },
          ]}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <AdminEmptyState
          icon={<Wrench size={20} />}
          title="No capabilities found"
          description={
            searchQuery.trim()
              ? "No capabilities match your search query."
              : "No capabilities exist under this filter."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => {
            const meta = STATUS_MAP[c.status] ?? { label: c.status, status: "paused" as const };
            return (
              <AdminEntityRow
                key={c.capability_key}
                icon={<Wrench size={16} className="text-sx-accent" />}
                title={c.name ?? c.capability_key}
                subtitle={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span>{c.description ?? "No description provided"}</span>
                    {c.fallback && (
                      <span className="text-sx-text-subtle">
                        · Fallback: <span className="font-mono text-sx-text-muted">{c.fallback}</span>
                      </span>
                    )}
                  </span>
                }
                meta={
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.provider && (
                      <span className="rounded-md border border-sx-border/80 bg-sx-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-sx-accent">
                        {c.provider}
                      </span>
                    )}
                    {c.execution_method && (
                      <span className="rounded-md border border-sx-border/60 bg-sx-surface-2/60 px-1.5 py-0.5 text-[10px] text-sx-text-muted">
                        {c.execution_method}
                      </span>
                    )}
                    {c.permission && (
                      <span className="hidden md:inline rounded-md border border-sx-border/40 bg-sx-surface-1 px-1.5 py-0.5 text-[9.5px] text-sx-text-subtle">
                        {c.permission}
                      </span>
                    )}
                  </div>
                }
                status={<AdminStatusDot status={meta.status} customLabel={meta.label} />}
                timestamp={formatRelativeTime(c.last_verified_at)}
                onOpenDetails={() => setSelectedCapability(c)}
                detailsAriaLabel={`Inspect capability ${c.name ?? c.capability_key}`}
              />
            );
          })}
        </div>
      )}

      {/* Universal Drawer */}
      {selectedCapability && (
        <AdminUniversalDrawer
          open={Boolean(selectedCapability)}
          onClose={() => setSelectedCapability(null)}
          entityType="CAPABILITY REGISTRY RECORD"
          title={selectedCapability.name ?? selectedCapability.capability_key}
          subtitle={selectedCapability.description ?? undefined}
          icon={<Wrench size={20} className="text-sx-accent" />}
          statusBadge={
            <AdminStatusDot
              status={STATUS_MAP[selectedCapability.status]?.status ?? "paused"}
              customLabel={STATUS_MAP[selectedCapability.status]?.label ?? selectedCapability.status}
            />
          }
        >
          <AdminDrawerSection title="Identifiers & Routing">
            <AdminDrawerRow label="Capability Key" value={selectedCapability.capability_key} mono />
            <AdminDrawerRow label="Provider" value={selectedCapability.provider ?? "Google AI Pro"} />
            <AdminDrawerRow label="Execution Method" value={selectedCapability.execution_method ?? "Founder Browser"} />
            <AdminDrawerRow label="Category" value={selectedCapability.category ?? "Uncategorized"} />
            <AdminDrawerRow
              label="Agent Tool Name"
              value={selectedCapability.agent_tool_name ?? "None (Internal routing)"}
              mono
            />
            <AdminDrawerRow
              label="Last Verified"
              value={
                selectedCapability.last_verified_at
                  ? new Date(selectedCapability.last_verified_at).toLocaleString()
                  : "Never verified"
              }
            />
          </AdminDrawerSection>

          <AdminDrawerSection title="Fallback Strategy & Policy">
            <AdminDrawerRow label="Preferred Resource" value={`${selectedCapability.provider ?? "Google AI Pro"} (${selectedCapability.execution_method ?? "Founder Browser"})`} />
            <AdminDrawerRow label="Fallback Resource" value={selectedCapability.fallback ?? "None"} />
            <AdminDrawerRow label="Autonomy Permission" value={selectedCapability.permission ?? "Autonomous"} />
            <AdminDrawerRow
              label="Requires Confirmation"
              value={selectedCapability.requires_confirmation ? "Yes (Founder Review Gate)" : "No (Autonomous)"}
            />
          </AdminDrawerSection>

          {selectedCapability.status_notes && (
            <AdminDrawerSection title="Status Notes">
              <p className="text-xs text-sx-text-muted leading-relaxed italic">
                {selectedCapability.status_notes}
              </p>
            </AdminDrawerSection>
          )}

          {selectedCapability.external_blocker && (
            <AdminDrawerSection title="External Blocker">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                ⚠️ Blocked on: {selectedCapability.external_blocker}
              </div>
            </AdminDrawerSection>
          )}

          <AdminDrawerSection title="Security & Sandboxing">
            <div className="flex items-center gap-2 text-xs text-sx-text-muted">
              <ShieldCheck size={14} className="text-sx-accent shrink-0" />
              <span>Execution is strictly bounded by Connector Control Plane authorization, tenant boundary isolation, and zero-secret credential protection.</span>
            </div>
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
