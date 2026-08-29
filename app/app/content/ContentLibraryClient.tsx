"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";
import { useCurrentTenant } from "../CurrentTenantContext";

export interface ContentItem {
  id: string;
  title: string;
  type: "image" | "video" | "caption" | "creative" | "poster";
  category: "draft" | "published" | "generated" | "saved";
  platform?: string;
  imageUrl?: string;
  captionText?: string;
  aspectRatio?: string;
  createdAt: string;
  publishedAt?: string;
  status: "DRAFT" | "QUEUED" | "PROCESSING" | "REVIEWING" | "REVISING" | "READY" | "FAILED" | "PUBLISHED" | "SCHEDULED" | "GENERATED";
  objective?: string;
  angle?: "Local & Friendly" | "Festive / Special Offer" | "5-Star Review Spotlight" | "Behind the Scenes";
  layoutArchetype?: string;
  errorMessage?: string;
  deleteKind?: "image_generation_job" | "content_variant" | "social_media_asset";
  metrics?: {
    reach?: number;
    engagement?: number;
    impressions?: number;
    clicks?: number;
  };
}

export const STRATEGIC_ANGLES = [
  { key: "local", label: "Local & Friendly", icon: "📍", desc: "Warm neighborhood tone with local community appeal" },
  { key: "offer", label: "Festive / Special Offer", icon: "🎉", desc: "High-conversion discount and festive promotion" },
  { key: "review", label: "5-Star Review Spotlight", icon: "⭐", desc: "Customer testimonial and trust-building social proof" },
  { key: "bts", label: "Behind the Scenes", icon: "🎬", desc: "Authentic founder and kitchen/shop craft story" },
] as const;

function statusPillClass(status: ContentItem["status"]): string {
  switch (status) {
    case "PUBLISHED":
      return "bg-emerald-600";
    case "READY":
      return "bg-blue-600";
    case "FAILED":
      return "bg-red-600";
    default:
      return "bg-amber-600";
  }
}

const CATEGORY_TABS = [
  { key: "all", label: "All Content" },
  { key: "creatives", label: "Creatives & Posters" },
  { key: "drafts", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "captions", label: "Captions & Copy" },
  { key: "videos", label: "Videos & Reels" },
  { key: "saved", label: "Saved Assets" },
] as const;

export function ContentLibraryClient({
  businessName,
  initialItems,
}: {
  businessName: string;
  initialItems: ContentItem[];
}) {
  const router = useRouter();
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId ?? null;
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync items when initialItems prop updates from server re-render
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Exclude any brand asset / logo variant items from the content feed
      const titleLower = item.title.toLowerCase();
      if (
        titleLower.includes("logo") ||
        titleLower.includes("transparent") ||
        titleLower.includes("monodark") ||
        titleLower.includes("mono_dark") ||
        titleLower.includes("mono-dark") ||
        titleLower.includes("monolight") ||
        titleLower.includes("mono_light") ||
        titleLower.includes("mono-light") ||
        titleLower.includes("monochrome") ||
        titleLower.includes("badge") ||
        titleLower.includes("brand_mark") ||
        titleLower.includes("brandmark") ||
        titleLower.includes("brand-mark") ||
        titleLower.includes("brand_asset") ||
        titleLower.includes("brandasset") ||
        titleLower.includes("brand-asset") ||
        titleLower.includes("brand_profile") ||
        titleLower.includes("shop_profile") ||
        titleLower.includes("profile_photo") ||
        titleLower.includes("shop_photo") ||
        titleLower.startsWith("brand-") ||
        titleLower.startsWith("brand_") ||
        titleLower === "brand"
      ) {
        return false;
      }

      // Tab filter
      if (activeTab === "creatives" && item.type !== "image" && item.type !== "creative" && item.type !== "poster") return false;
      if (activeTab === "drafts" && !["DRAFT", "READY", "QUEUED", "PROCESSING", "REVIEWING", "REVISING"].includes(item.status)) return false;
      if (activeTab === "published" && item.status !== "PUBLISHED") return false;
      if (activeTab === "captions" && item.type !== "caption") return false;
      if (activeTab === "videos" && item.type !== "video") return false;
      if (activeTab === "saved" && item.category !== "saved") return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesCaption = item.captionText?.toLowerCase().includes(q);
        const matchesType = item.type.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCaption && !matchesType) return false;
      }

      return true;
    });
  }, [items, activeTab, searchQuery]);

  const handleCopy = (item: ContentItem) => {
    const textToCopy = item.captionText || item.title;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (item: ContentItem) => {
    if (item.imageUrl) {
      const link = document.createElement("a");
      link.href = item.imageUrl;
      link.download = `${item.title.toLowerCase().replace(/\\s+/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const blob = new Blob([item.captionText || item.title], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${item.title.toLowerCase().replace(/\\s+/g, "-")}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleShare = async (item: ContentItem) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.captionText || `Check out this creative from ${businessName}`,
          url: item.imageUrl || window.location.href,
        });
      } catch {
        // Fallback to copy
        handleCopy(item);
      }
    } else {
      handleCopy(item);
    }
  };

  const handleRegenerateAngle = (item: ContentItem, angleKey: string) => {
    const angleObj = STRATEGIC_ANGLES.find((a) => a.key === angleKey) || STRATEGIC_ANGLES[0];
    router.push(
      `/app/social/copilot?prompt=${encodeURIComponent(
        `Create a strategic social post for ${businessName} focusing on ${angleObj.label}: ${angleObj.desc}. Ground in our verified business facts and customer psychology.`
      )}`
    );
  };

  const handleDelete = async (item: ContentItem) => {
    if (!item.deleteKind || !tenantId) return;
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      setDeleteError(null);
      return;
    }
    setDeletingId(item.id);
    setDeleteError(null);
    try {
      const response = await fetch(
        `/api/platform/content/${encodeURIComponent(item.id)}?tenantId=${encodeURIComponent(tenantId)}&kind=${encodeURIComponent(item.deleteKind)}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not delete this item.");
      setItems((current) => current.filter((it) => it.id !== item.id));
      if (previewItem?.id === item.id) setPreviewItem(null);
    } catch (err) {
      setDeleteError({ id: item.id, message: err instanceof Error ? err.message : "Could not delete this item." });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sx-text">Content & Media</h1>
          <p className="mt-0.5 text-sm text-sx-text-muted">
            Creatives, social drafts, published posts, and brand media for {businessName}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3.5 text-xs sm:text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2 disabled:opacity-50"
            title="Refresh content from server"
          >
            <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
            <span>{isRefreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <Link
            href="/app/content/studio"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sx-sm bg-sx-accent px-4 text-xs sm:text-sm font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent/90"
          >
            <span>🎨</span>
            <span>Create Poster</span>
          </Link>
          <Link
            href="/app/social/copilot"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3.5 text-xs sm:text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-3"
          >
            <span>💬</span>
            <span>Ask Assistant</span>
          </Link>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Link
          href="/app/content/studio"
          className="flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-accent/40"
        >
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-sx-sm bg-sx-accent-muted text-base">🎨</span>
          <span className="text-[13px] font-bold text-sx-text">Creative Studio</span>
          <span className="text-[11px] text-sx-text-subtle">AI posters & design</span>
        </Link>
        <Link
          href="/app/content/calendar"
          className="flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-accent/40"
        >
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-sx-sm bg-emerald-500/10 text-base">📅</span>
          <span className="text-[13px] font-bold text-sx-text">Content Calendar</span>
          <span className="text-[11px] text-sx-text-subtle">Scheduled schedule</span>
        </Link>
        <Link
          href="/app/content/pipeline"
          className="flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-accent/40"
        >
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-sx-sm bg-amber-500/10 text-base">⚡</span>
          <span className="text-[13px] font-bold text-sx-text">Publishing Pipeline</span>
          <span className="text-[11px] text-sx-text-subtle">Drafts & approvals</span>
        </Link>
        <Link
          href="/app/social/copilot"
          className="flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-accent/40"
        >
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-sx-sm bg-purple-500/10 text-base">💬</span>
          <span className="text-[13px] font-bold text-sx-text">Growth Copywriter</span>
          <span className="text-[11px] text-sx-text-subtle">Hinglish captions & offers</span>
        </Link>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sx-thin-scroll">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-sx-pill px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? "bg-sx-accent text-sx-accent-on"
                  : "bg-sx-surface-2 text-sx-text-muted hover:bg-sx-surface-3 hover:text-sx-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search content by keyword, title, caption..."
            className="h-10 w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 pl-9 pr-4 text-xs sm:text-sm text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
          />
          <svg
            className="absolute left-3 top-3 h-4 w-4 text-sx-text-subtle"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Content Grid */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sx-lg border border-dashed border-sx-border bg-sx-surface-1 py-12 px-4 text-center">
          <span className="text-4xl mb-3">🎨</span>
          <p className="text-base font-bold text-sx-text">No content found</p>
          <p className="mt-1 max-w-sm text-xs text-sx-text-muted">
            {searchQuery ? "No creatives match your search terms." : "Create festival posters, Instagram captions, and promo flyers using AI."}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/app/content/studio"
              className="rounded-sx-sm bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on"
            >
              Create New Poster
            </Link>
            <Link
              href="/app/social/copilot"
              className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-4 py-2 text-xs font-semibold text-sx-text"
            >
              Ask Growth Assistant
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 transition-all hover:border-sx-accent/50 hover:shadow-md"
            >
              {/* Media Preview or Text Header */}
              {item.imageUrl ? (
                <div
                  className="relative aspect-square w-full cursor-pointer overflow-hidden bg-black/20"
                  onClick={() => setPreviewItem(item)}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white shadow-sm ${statusPillClass(item.status)}`}>
                      {item.status}
                    </span>
                    {item.layoutArchetype && (
                      <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-xs">
                        {item.layoutArchetype}
                      </span>
                    )}
                    {item.aspectRatio && (
                      <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                        {item.aspectRatio}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="flex h-36 w-full cursor-pointer flex-col justify-between border-b border-sx-border bg-gradient-to-br from-sx-surface-2 to-sx-surface-3 p-4"
                  onClick={() => setPreviewItem(item)}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xl">✍️</span>
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      {item.layoutArchetype && (
                        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-sx-text">
                          {item.layoutArchetype}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white ${statusPillClass(item.status)}`}>
                        {item.status}
                      </span>
                    </span>
                  </div>
                  <p className="line-clamp-3 break-words text-xs italic text-sx-text hyphens-none">
                    &ldquo;{item.captionText || item.title}&rdquo;
                  </p>
                </div>
              )}

              {/* Details & Copy */}
              <div className="flex flex-1 flex-col justify-between p-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="line-clamp-1 break-words text-[14px] font-bold text-sx-text hyphens-none">{item.title}</h3>
                    {item.angle && (
                      <span className="shrink-0 rounded-sx-xs bg-sx-accent-muted px-2 py-0.5 text-[10px] font-bold text-sx-accent">
                        {item.angle}
                      </span>
                    )}
                  </div>
                  {item.captionText && (
                    <p className="mt-1 line-clamp-2 break-words text-xs text-sx-text-subtle hyphens-none">{item.captionText}</p>
                  )}
                  {item.objective && (
                    <p className="mt-1.5 text-[11px] font-medium text-sx-text-muted flex items-center gap-1">
                      <span>🎯</span>
                      <span className="break-words hyphens-none">{item.objective}</span>
                    </p>
                  )}
                </div>

                {/* Published Performance Snapshot if available */}
                {item.status === "PUBLISHED" && (
                  <div className="mt-3 rounded-sx-sm border border-sx-border/60 bg-sx-surface-2/60 p-2 text-[11px]">
                    <div className="flex items-center justify-between text-sx-text-muted">
                      <span>Platform: {item.platform ? item.platform.toUpperCase() : "Instagram"}</span>
                      <span className="font-semibold text-emerald-500">Live</span>
                    </div>
                    {item.metrics ? (
                      <div className="mt-1 flex items-center justify-between font-semibold text-sx-text">
                        <span>Reach: {item.metrics.reach?.toLocaleString() ?? "—"}</span>
                        <span>Engagement: {item.metrics.engagement?.toLocaleString() ?? "—"}</span>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-sx-text-subtle">Analytics syncing from connected accounts</p>
                    )}
                  </div>
                )}

                {/* A real, persisted generation failure -- never hidden behind a bare "FAILED" pill with no explanation. */}
                {item.status === "FAILED" && item.errorMessage && (
                  <div className="mt-3 rounded-sx-sm border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
                    <p className="break-words hyphens-none">{item.errorMessage}</p>
                  </div>
                )}

                {/* Action Toolbar */}
                <div className="mt-3 flex items-center justify-between border-t border-sx-border/60 pt-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(item)}
                      title="Copy text/caption"
                      className="flex h-7 items-center gap-1 rounded-sx-xs px-2 text-[11px] font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                    >
                      <span>{copiedId === item.id ? "✓" : "📋"}</span>
                      <span>{copiedId === item.id ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      title="Download image/file"
                      className="flex h-7 items-center gap-1 rounded-sx-xs px-2 text-[11px] font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                    >
                      <span>📥</span>
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShare(item)}
                      title="Share"
                      className="flex h-7 items-center gap-1 rounded-sx-xs px-2 text-[11px] font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                    >
                      <span>📤</span>
                      <span>Share</span>
                    </button>
                    {item.deleteKind && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        onBlur={() => confirmDeleteId === item.id && setConfirmDeleteId(null)}
                        disabled={deletingId === item.id}
                        title={confirmDeleteId === item.id ? "Click again to permanently delete" : "Delete"}
                        className={`flex h-7 items-center gap-1 rounded-sx-xs px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          confirmDeleteId === item.id ? "bg-red-500/15 text-red-500" : "text-sx-text-muted hover:bg-red-500/10 hover:text-red-500"
                        }`}
                      >
                        <span>🗑️</span>
                        <span>{deletingId === item.id ? "Deleting…" : confirmDeleteId === item.id ? "Confirm?" : "Delete"}</span>
                      </button>
                    )}
                  </div>

                  {item.status !== "FAILED" && (
                    <Link
                      href={`/app/social/copilot`}
                      className="text-[11px] font-bold text-sx-accent hover:underline"
                    >
                      {item.status === "PUBLISHED" ? "Promote →" : "Publish →"}
                    </Link>
                  )}
                </div>
                {deleteError?.id === item.id && <p className="mt-2 text-[11px] text-red-400">{deleteError.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail / Fullscreen Preview Modal */}
      {previewItem && (
        <Modal
          open={Boolean(previewItem)}
          onClose={() => setPreviewItem(null)}
          title={previewItem.title}
        >
          <div className="flex flex-col gap-4 pb-2">
            {previewItem.imageUrl && (
              <div className="overflow-hidden rounded-sx-md border border-sx-border bg-black/40">
                <img
                  src={previewItem.imageUrl}
                  alt={previewItem.title}
                  className="max-h-[50vh] w-full object-contain mx-auto"
                />
              </div>
            )}

            {previewItem.layoutArchetype && (
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sx-text-muted">
                <span>Layout:</span>
                <span className="rounded-sx-xs bg-sx-surface-2 px-2 py-0.5 font-bold tracking-wider text-sx-text">{previewItem.layoutArchetype}</span>
              </div>
            )}

            {previewItem.status === "FAILED" && previewItem.errorMessage && (
              <div className="rounded-sx-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                <p className="break-words hyphens-none">{previewItem.errorMessage}</p>
              </div>
            )}

            {/* Strategic Rationale Banner */}
            <div className="rounded-sx-md border border-sx-accent/30 bg-sx-accent-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sx-accent">
                <span>🎯</span>
                <span>Why this content?</span>
              </div>
              <p className="mt-1 text-xs text-sx-text leading-relaxed">
                {previewItem.objective || `Tailored specifically for ${businessName} to drive local customer footfall, boost weekend bookings, and increase engagement on connected social platforms.`}
              </p>
            </div>

            {/* Strategic Angle Switcher */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle mb-1.5">
                Regenerate with Angle:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STRATEGIC_ANGLES.map((ang) => (
                  <button
                    key={ang.key}
                    type="button"
                    onClick={() => handleRegenerateAngle(previewItem, ang.key)}
                    className={`flex items-start gap-2 rounded-sx-sm border p-2 text-left transition-colors ${
                      previewItem.angle === ang.label
                        ? "border-sx-accent bg-sx-accent-muted text-sx-accent"
                        : "border-sx-border bg-sx-surface-2 hover:bg-sx-surface-3 text-sx-text"
                    }`}
                  >
                    <span className="text-sm">{ang.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-none">{ang.label}</p>
                      <p className="mt-1 text-[10px] text-sx-text-subtle line-clamp-1">{ang.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {previewItem.captionText && (
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">Caption / Copy</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-sx-text hyphens-none">{previewItem.captionText}</p>
              </div>
            )}

            {/* Generation Diagnostics */}
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono text-sx-text-subtle border-t border-sx-border/60 pt-2">
              <span className="rounded bg-sx-surface-2 px-1.5 py-0.5" title={previewItem.id}>ID: {previewItem.id.slice(0, 18)}…</span>
              <span className="rounded bg-sx-surface-2 px-1.5 py-0.5">Status: {previewItem.status}</span>
              {previewItem.layoutArchetype && <span className="rounded bg-sx-surface-2 px-1.5 py-0.5">Layout: {previewItem.layoutArchetype}</span>}
              <span className="rounded bg-sx-surface-2 px-1.5 py-0.5">Created: {new Date(previewItem.createdAt).toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between border-t border-sx-border pt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewItem)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-xs font-semibold text-sx-text hover:bg-sx-surface-2"
                >
                  <span>📥</span> Download
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(previewItem)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 text-xs font-semibold text-sx-text hover:bg-sx-surface-2"
                >
                  <span>📋</span> {copiedId === previewItem.id ? "Copied!" : "Copy Text"}
                </button>
                {previewItem.deleteKind && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(previewItem)}
                    disabled={deletingId === previewItem.id}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-sx-sm border px-3 text-xs font-semibold disabled:opacity-50 ${
                      confirmDeleteId === previewItem.id ? "border-red-500/40 bg-red-500/15 text-red-500" : "border-sx-border bg-sx-surface-1 text-sx-text hover:bg-red-500/10 hover:text-red-500"
                    }`}
                  >
                    <span>🗑️</span> {deletingId === previewItem.id ? "Deleting…" : confirmDeleteId === previewItem.id ? "Confirm delete?" : "Delete"}
                  </button>
                )}
              </div>
              {deleteError?.id === previewItem.id && <p className="text-xs text-red-400">{deleteError.message}</p>}

              <Link
                href="/app/social/copilot"
                className="inline-flex h-9 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on hover:bg-sx-accent/90"
              >
                Use in Growth Assistant →
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
