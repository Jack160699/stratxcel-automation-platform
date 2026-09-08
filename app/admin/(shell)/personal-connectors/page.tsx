"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

function PersonalConnectorsContent() {
  const searchParams = useSearchParams();
  const connectedKey = searchParams.get("connected");
  const queryError = searchParams.get("error");

  const [rows, setRows] = useState<ConnectorItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilterId>("all");
  const [selectedItem, setSelectedItem] = useState<ConnectorItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Handle OAuth query param alerts
  useEffect(() => {
    if (connectedKey) {
      setToast({
        message: `Successfully connected ${connectedKey === "google_ai_pro" ? "Google AI Pro" : connectedKey}!`,
        type: "success",
      });
    } else if (queryError) {
      setToast({
        message: decodeURIComponent(queryError),
        type: "error",
      });
    }
  }, [connectedKey, queryError]);

  const loadConnectors = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await platformFetch("/api/platform/admin/personal-connectors");
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `Failed to load personal connectors (${res.status})`);
      }
      setRows(body.connectors ?? []);
      // If drawer is currently open for an item, update it with fresh data
      setSelectedItem((current) => {
        if (!current) return null;
        return (body.connectors ?? []).find(
          (c: ConnectorItem) => c.definition.key === current.definition.key
        ) ?? current;
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load connectors",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  // Filtered rows based on category and search query
  const filteredRows = useMemo(() => {
    return (rows ?? []).filter((item) => {
      const meta = getConnectorMeta(item.definition.key, item.definition.label);

      // Category filter
      if (activeCategory !== "all" && meta.category !== activeCategory) {
        return false;
      }

      // Search query filter
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

  function handlePrimaryAction(item: ConnectorItem) {
    if (item.definition.key === "google_ai_pro") {
      // Initiates external OAuth redirect via API route
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/admin/personal-connectors/google-ai-pro/connect";
    } else {
      setSelectedItem(item);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* 1. Header with Inline Summary & Refresh */}
      <ConnectorHeader
        title="Personal Connectors"
        subtitle="Founder-owned accounts and external subscriptions available to Hermes."
        totalCount={rows?.length ?? 16}
        connectedCount={connectedCount}
        attentionCount={attentionCount}
        onRefresh={() => void loadConnectors(true)}
        refreshing={refreshing}
      />

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

      {/* 2. Filter & Instant Search */}
      <ConnectorFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        counts={categoryCounts}
      />

      {/* 3. Main Connector List (Progressive Disclosure - High Density Rows) */}
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
              ? `No personal connectors matched "${searchQuery}".`
              : "No personal connectors found in this category."}
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
              onPrimaryAction={handlePrimaryAction}
            />
          ))}
        </div>
      )}

      {/* 4. Progressive Disclosure Detail Drawer */}
      <ConnectorDrawer
        item={selectedItem}
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onUpdated={() => void loadConnectors()}
      />
    </div>
  );
}

export default function PersonalConnectorsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-sx-text-subtle">
          Loading Personal Connectors…
        </div>
      }
    >
      <PersonalConnectorsContent />
    </Suspense>
  );
}
