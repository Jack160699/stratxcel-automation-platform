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
}

const STATUS_MAP: Record<string, { label: string; status: string }> = {
  REAL_EXPOSED: { label: "Live Exposed", status: "connected" },
  PARTIAL: { label: "Partial", status: "needs_attention" },
  REAL_NOT_EXPOSED: { label: "Internal Only", status: "waiting" },
  NOT_BUILT: { label: "In Roadmap", status: "paused" },
  EXTERNAL_REQUIRED: { label: "External Blocker", status: "needs_attention" },
  BROKEN: { label: "Broken", status: "error" },
};

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

  const filtered = useMemo(() => {
    return capabilities.filter((c) => {
      if (statusFilter === "live" && c.status !== "REAL_EXPOSED") return false;
      if (statusFilter === "building" && !["PARTIAL", "NOT_BUILT", "REAL_NOT_EXPOSED"].includes(c.status)) return false;
      if (statusFilter === "blocked" && !["EXTERNAL_REQUIRED", "BROKEN"].includes(c.status)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (c.name?.toLowerCase().includes(q) ?? false) ||
          c.capability_key.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false) ||
          (c.category?.toLowerCase().includes(q) ?? false)
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
        description="Authoritative catalog of what the Hermes Autonomous Engine and Copilot agents can execute."
        actions={
          <div className="flex items-center gap-3 text-xs text-sx-text-muted">
            <span>
              Total: <b>{capabilities.length}</b>
            </span>
            <span>·</span>
            <span className="text-[#5BDCA7]">
              Live: <b>{countsByStatus["REAL_EXPOSED"] ?? 0}</b>
            </span>
            <span>·</span>
            <span className="text-[#F3C55C]">
              Blocked: <b>{(countsByStatus["EXTERNAL_REQUIRED"] ?? 0) + (countsByStatus["BROKEN"] ?? 0)}</b>
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
            placeholder="Search capabilities or tools…"
            className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none"
          />
        </div>

        <AdminSegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          options={[
            { value: "all", label: "All", badge: capabilities.length },
            { value: "live", label: "Live Exposed", badge: countsByStatus["REAL_EXPOSED"] ?? 0 },
            {
              value: "building",
              label: "In Progress",
              badge: (countsByStatus["PARTIAL"] ?? 0) + (countsByStatus["REAL_NOT_EXPOSED"] ?? 0),
            },
            {
              value: "blocked",
              label: "Blocked",
              badge: (countsByStatus["EXTERNAL_REQUIRED"] ?? 0) + (countsByStatus["BROKEN"] ?? 0),
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
            const meta = STATUS_MAP[c.status] ?? { label: c.status, status: "paused" };
            return (
              <AdminEntityRow
                key={c.capability_key}
                icon={<Wrench size={16} className="text-sx-accent" />}
                title={c.name ?? c.capability_key}
                subtitle={c.description ?? "No description provided"}
                meta={
                  c.category && (
                    <span className="rounded-full bg-sx-surface-2 px-2 py-0.5 text-[10px] font-medium text-sx-text-subtle uppercase tracking-wider">
                      {c.category}
                    </span>
                  )
                }
                status={<AdminStatusDot status={meta.status} customLabel={meta.label} />}
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
              <ShieldCheck size={14} className="text-sx-accent" />
              <span>Execution is strictly bounded by role-based capabilities and budget envelopes.</span>
            </div>
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
