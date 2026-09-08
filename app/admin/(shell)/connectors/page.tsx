"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { platformFetch } from "@/lib/admin/platform-fetch";
import {
  ConnectorHeader,
  ConnectorFilterBar,
  ConnectorRow,
  ConnectorDrawer,
  type ConnectorItem,
  type CategoryFilterId,
  getConnectorMeta,
} from "@/components/admin/connectors";

function PlatformConnectorsContent() {
  const { active } = useCurrentTenant();
  const [rows, setRows] = useState<ConnectorItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilterId>("all");
  const [selectedItem, setSelectedItem] = useState<ConnectorItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadConnectors = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const url = active?.tenantId
        ? `/api/platform/admin/connectors?tenantId=${encodeURIComponent(active.tenantId)}`
        : "/api/platform/admin/connectors";
      const res = await platformFetch(url);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `Failed to load platform connectors (${res.status})`);
      }
      setRows(body.connectors ?? []);
      setSelectedItem((current) => {
        if (!current) return null;
        return (body.connectors ?? []).find(
          (c: ConnectorItem) => c.definition.key === current.definition.key
        ) ?? current;
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load platform connectors",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [active?.tenantId]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  // Summary counts
  const { connectedCount, attentionCount, categoryCounts } = useMemo(() => {
    const list = rows ?? [];
    let connected = 0;
    let attention = 0;
    const catMap: Record<string, number> = { all: list.length };

    for (const item of list) {
      const s = (item.health?.status ?? "not_configured").toLowerCase();
      if (["connected", "healthy"].includes(s)) connected++;
      if (["auth_required", "auth_expired", "requires_reauth", "pending", "error"].includes(s)) attention++;

      const meta = getConnectorMeta(item.definition.key);
      catMap[meta.category] = (catMap[meta.category] ?? 0) + 1;
    }

    return {
      connectedCount: connected,
      attentionCount: attention,
      categoryCounts: catMap,
    };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return (rows ?? []).filter((item) => {
      const meta = getConnectorMeta(item.definition.key, item.definition.label);

      if (activeCategory !== "all" && meta.category !== activeCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = meta.name.toLowerCase().includes(q);
        const matchesKey = item.definition.key.toLowerCase().includes(q);
        const matchesDesc = meta.oneLiner.toLowerCase().includes(q);
        if (!matchesName && !matchesKey && !matchesDesc) return false;
      }

      return true;
    });
  }, [rows, activeCategory, searchQuery]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* 1. Header with Inline Summary & Refresh */}
      <ConnectorHeader
        title="Platform Connectors"
        subtitle="StratXcel platform infrastructure and company external services."
        totalCount={rows?.length ?? 0}
        connectedCount={connectedCount}
        attentionCount={attentionCount}
        onRefresh={() => void loadConnectors(true)}
        refreshing={refreshing}
      />

      {/* 2. Cross-Navigation Banner to Personal Connectors */}
      <div className="flex items-center justify-between rounded-xl border border-sx-border/80 bg-sx-surface-2/60 px-4 py-3 text-xs">
        <div className="flex items-center gap-2 text-sx-text-muted">
          <span className="font-semibold text-sx-text">Founder Resources?</span>
          <span>Looking for Founder accounts, AI subscriptions, or personal resources?</span>
        </div>
        <Link
          href="/admin/personal-connectors"
          className="font-medium text-sx-accent hover:underline flex items-center gap-1 shrink-0 ml-4"
        >
          <span>Personal Connectors</span>
          <span>→</span>
        </Link>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`flex items-center justify-between rounded-xl border p-3 text-xs font-medium ${
            toast.type === "success"
              ? "border-[#5BDCA7]/30 bg-[#5BDCA7]/10 text-[#5BDCA7]"
              : "border-[#FF8A90]/30 bg-[#FF8A90]/10 text-[#FF8A90]"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Filter & Instant Search */}
      <ConnectorFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        counts={categoryCounts}
      />

      {/* 4. Main Connector List (Compact Rows) */}
      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded-xl border border-sx-border/40 bg-sx-surface-2/40"
            />
          ))}
        </div>
      )}

      {!loading && filteredRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-sx-border bg-sx-surface-1 p-12 text-center">
          <p className="font-sx-sans text-sm font-medium text-sx-text">No connectors found</p>
          <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">
            {searchQuery
              ? `No platform connectors matched "${searchQuery}".`
              : "No platform connectors found in this category."}
          </p>
          {(searchQuery || activeCategory !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              className="mt-3 text-xs font-semibold text-sx-accent hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <div className="space-y-2">
          {filteredRows.map((item) => (
            <ConnectorRow
              key={item.definition.key}
              item={item}
              onOpenDetails={(row) => setSelectedItem(row)}
              onPrimaryAction={(row) => setSelectedItem(row)}
            />
          ))}
        </div>
      )}

      {/* 5. Progressive Disclosure Detail Drawer */}
      <ConnectorDrawer
        item={selectedItem}
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onUpdated={() => void loadConnectors()}
      />
    </div>
  );
}

export default function PlatformConnectorsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-sx-text-subtle">
          Loading Platform Connectors…
        </div>
      }
    >
      <PlatformConnectorsContent />
    </Suspense>
  );
}
