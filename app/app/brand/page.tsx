"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import { DigitalPresenceCards } from "@/components/audit/DigitalPresenceCards";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";
import { validateBrandBrainContent, HIGHLIGHT_MAX_LENGTH, HIGHLIGHTS_MAX_COUNT, type BrandBrainService } from "@stratxcel/brand-brain";
import { LogoAnalyzerFlow } from "./LogoAnalyzerFlow";
import { ServicesEditor } from "./ServicesEditor";

interface BrandBrainContent {
  business_name?: string;
  industry?: string;
  website_url?: string;
  location?: string;
  /** Shop-facing contact number — StratXcel App reference's Location & Hours row. Distinct from the WhatsApp OTP-verified number (Connected Accounts); this is a plain display field for the shop's public phone line, no verification. */
  business_phone?: string;
  /** Optional shop-facing email — "email where supported" (Brand Brain Final UX + Data + Save System §6). Never required; not every business wants a public inbox. */
  business_email?: string;
  /** Weekly hours as one free-text line (e.g. "Mon–Sat: 8:00 AM – 9:30 PM") — kept as a single field like every other Brand Brain string, not a structured per-day schema. */
  business_hours?: string;
  /** @deprecated Superseded by `services` — see ServicesEditor / getCanonicalServices (@stratxcel/brand-brain). Left unedited by this page; kept only so a tenant's pre-existing tags aren't silently deleted. */
  catalog_tags?: string[];
  /** Short highlight lines — Brand Center's "Business Highlights". A
   * concise summary, NOT the service catalog (Section 2) — length/count
   * guided client-side and enforced server-side (validateBrandBrainContent). */
  highlights?: string[];
  /** The canonical, structured services/products list. Always read via
   * getCanonicalServices() elsewhere in the platform — this page edits the
   * raw array directly since it IS the source of truth being edited. */
  services?: BrandBrainService[];
  positioning?: string;
  tone_of_voice?: string;
  target_audience?: string;
  differentiators?: string[];
  goals?: string[];
  channels?: string[];
  pillars?: string[];
  rules?: string[];
  /** @deprecated Superseded by `services`. Read-fallback only (getCanonicalServices) — this page no longer writes it. */
  products?: { name: string; description: string }[];
  biggest_business_problem?: string;
  [key: string]: unknown;
}

interface ShopPhoto {
  id: string;
  name: string;
  url: string | null;
}

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const EMPTY: BrandBrainContent = {};

/** Weekend-hours check for the Brand Center screen's warning — a real, deterministic read of the business_hours text (no fabricated static warning). */
function missingWeekendHours(hours: string | undefined): boolean {
  if (!hours || !hours.trim()) return true;
  return !/sat|sun|weekend/i.test(hours);
}

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved ✓",
  error: "Save failed",
};

const SAVE_STATUS_COLOR: Record<SaveStatus, string> = {
  idle: "text-sx-text-subtle",
  unsaved: "text-sx-warning",
  saving: "text-sx-text-subtle",
  saved: "text-sx-success",
  error: "text-sx-danger",
};

/**
 * Brand Center — StratXcel App reference (Claude Design project
 * 6c2ad0a0-c8c8-47d1-a79d-3a1b255a7b01, "Brand Center" screen), rebuilt
 * again for the Brand Brain Final UX + Data + Save System mission:
 *
 *  - Save is now an explicit, unambiguous state machine (idle/unsaved/
 *    saving/saved/error), never the old plain saving/saved booleans that
 *    left "did my edit actually save?" ambiguous the moment a save failed
 *    or the user kept typing. A failed save NEVER clears `content` — Retry
 *    re-runs save() again with the exact same in-memory edits, never
 *    load() (which would silently discard them by overwriting with
 *    server state).
 *  - "Catalog & Services" (bare chips) and the old read-only "Products &
 *    Services" display are both replaced by one real Services section
 *    (ServicesEditor) — add/edit/archive/delete/reorder, structured
 *    fields, not a giant textarea.
 *  - Business Highlights gets real length/count guidance, enforced both
 *    client-side (fail fast) and server-side (validateBrandBrainContent).
 *
 * @stratxcel/brand-brain's versioned tables and this page's load/save
 * flow predate this pass and are unchanged. The deeper AI-context fields
 * (positioning, tone, differentiators, goals, pillars, rules — what
 * missions and AI agents execute against) are preserved in full below.
 */
export default function BrandPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const readOnly = active?.accessMode === "staff_support";
  const [content, setContent] = useState<BrandBrainContent | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadSequence = useRef(0);

  // Save state machine (Section 1) — the single source of truth for what
  // the Save button/status label show. `dirty` tracks "does content differ
  // from what's actually persisted"; `saving`/`saveError`/`justSaved` track
  // the in-flight request. Derived into one SaveStatus below rather than
  // juggled as separate booleans at every call site.
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const saveStatus: SaveStatus = saving ? "saving" : saveError ? "error" : justSaved ? "saved" : dirty ? "unsaved" : "idle";

  const [photos, setPhotos] = useState<ShopPhoto[]>([]);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!tenantId) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setContent(null);
    setVersion(null);
    const result = await loadCustomerJson<{ brandBrain?: { content?: BrandBrainContent; current_version?: number } | null }>(
      () => fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`),
      "We couldn't load your shop details right now."
    );
    if (requestId !== loadSequence.current) return;
    setLoading(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    const loaded = result.data.brandBrain?.content ?? EMPTY;
    // Business name has no placeholder (unlike every other field on this
    // page) because it's always required — so an empty Brand Brain left it
    // rendering as a genuinely blank box for a business whose name the
    // platform already knows (tenant.name), found live during E2E testing.
    // Pre-fill from the known tenant name; still just an in-memory default
    // until the customer hits Save Changes, same as every other edit here.
    const businessName = loaded.business_name?.trim() ? loaded.business_name : active?.name;
    setContent(businessName ? { ...loaded, business_name: businessName } : loaded);
    setVersion(result.data.brandBrain?.current_version ?? 0);
    // A fresh load is, by definition, exactly what's persisted — never
    // "unsaved", never a stale error/saved flash from a previous visit.
    setDirty(false);
    setSaveError(null);
    setJustSaved(false);
  }

  async function loadPhotos() {
    if (!tenantId) return;
    setPhotosError(null);
    const result = await loadCustomerJson<{ photos: ShopPhoto[] }>(
      () => fetch(`/api/platform/brand/photos?tenantId=${encodeURIComponent(tenantId)}`),
      "We couldn't load your shop photos right now."
    );
    if (result.status === "error") {
      setPhotosError(result.message);
      return;
    }
    setPhotos(result.data.photos);
  }

  useEffect(() => {
    load();
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Section 15: never silently discard edits by navigating/closing away
  // from them. Covers tab close / refresh / external navigation — the
  // one confirm-before-leaving hook the browser itself provides;
  // in-app client-side route changes have no equivalent first-party Next.js
  // App Router guard without a broader shell-level change, so this is
  // deliberately scoped to what beforeunload actually covers.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirty && !saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, saving]);

  function field<K extends keyof BrandBrainContent>(key: K, value: BrandBrainContent[K]) {
    setContent((c) => ({ ...(c ?? EMPTY), [key]: value }));
    setDirty(true);
    setJustSaved(false);
    // A fresh edit supersedes a previous failure — the status line goes
    // back to "Unsaved changes" (the honest current state) rather than
    // leaving a stale "Save failed" banner sitting over new, un-retried edits.
    setSaveError(null);
  }

  const validationIssues = content ? validateBrandBrainContent(content) : [];
  const canSave = Boolean(!readOnly && content && dirty && !saving && validationIssues.length === 0);

  async function save() {
    if (!tenantId || !content) return;
    if (validationIssues.length) {
      // Client-side pre-check (validateBrandBrainContent is the exact same
      // pure function the server re-runs) — fails fast with the specific
      // field-level reason instead of a round-trip 400.
      setSaveError(validationIssues[0]!.issue);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await loadCustomerJson<{ version: { version: number } }>(
        () =>
          fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // POST /api/platform/brand requires tenantId in the JSON body
            // (only GET reads it from the query string) — omitting it here
            // 400'd "tenantId is required" on every save, found live
            // during E2E testing.
            body: JSON.stringify({ tenantId, content }),
          }),
        "We couldn't save your shop details right now."
      );
      if (result.status === "error") {
        // Real bug fixed here (Section 15): a failed save must never clear
        // or reload `content` — the customer's typed edits stay exactly as
        // they entered them, and Retry (this same save() function) tries
        // again with those exact values. The old top-of-page ErrorState's
        // "Retry" called load(), which would have silently thrown away
        // whatever the customer just typed by overwriting it with
        // server state.
        setSaveError(result.message);
        return;
      }
      setVersion(result.data.version.version);
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      trackFunnel("brand_brain_completed", { surface: "app_brand" });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Real bug found live (Content Cleanup / BrandBrain Logo Engine
   * mission): this used to POST raw multipart FormData directly to
   * /api/platform/brand/photos, but that route only ever implemented the
   * two-phase JSON `prepare` (issue a signed upload URL) -> PUT the bytes
   * -> `finalize` (mark the asset READY) protocol -- request.json() on a
   * multipart body returns {}, so tenantId was always "missing" and every
   * upload 400'd immediately, in production, for every tenant. Also: the
   * old code read data.photo.public_url, a field the real route's
   * finalize response has never returned (see the real shape below) --
   * even a successful upload would have set logo_url to undefined.
   * uploadToSignedUrlWithProgress (imported, previously unused) is the
   * correct client half of this exact protocol, already established by
   * Creative Studio's reference-image upload.
   */
  async function uploadPhoto(file: File) {
    if (!tenantId || readOnly) return;
    setUploadingPhoto(true);
    setPhotosError(null);
    try {
      const prepareRes = await fetch("/api/platform/brand/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "prepare", name: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok) {
        setPhotosError(prepareData.error || "We couldn't start your upload right now.");
        return;
      }
      const { assetId, signedUrl } = prepareData as { assetId: string; signedUrl: string };
      await uploadToSignedUrlWithProgress(signedUrl, file, () => {});

      const finalizeRes = await fetch("/api/platform/brand/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "finalize", assetId }),
      });
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) {
        setPhotosError(finalizeData.error || "We couldn't finish your upload right now.");
        return;
      }
      await loadPhotos();
    } catch {
      setPhotosError("We couldn't upload your photo right now.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(photoId: string) {
    if (!tenantId || readOnly) return;
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    await fetch(`/api/platform/brand/photos?tenantId=${encodeURIComponent(tenantId)}&assetId=${encodeURIComponent(photoId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  const weekendMissing = missingWeekendHours(content?.business_hours);
  const highlightsCount = content?.highlights?.length ?? 0;

  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <header className="flex flex-col gap-1">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-sx-text">My Shop{active ? ` · ${active.name}` : ""}</h1>
            <p className="text-xs text-sx-text-muted">Tell StratXcel about your business once, save it, and every StratXcel service understands it automatically.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="primary" size="cta" onClick={save} disabled={!canSave && saveStatus !== "error"}>
              {saving ? "Saving…" : saveStatus === "error" ? "Save failed — Retry" : "Save Changes"}
            </Button>
            <span role="status" className={`text-[11px] font-semibold ${SAVE_STATUS_COLOR[saveStatus]}`}>
              {SAVE_STATUS_LABEL[saveStatus]}
            </span>
          </div>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {saveError && (
        <div role="alert" className="flex flex-col gap-2 rounded-sx-md border border-[rgb(242_86_95_/_0.35)] bg-[rgb(242_86_95_/_0.06)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-sx-text">{saveError}</p>
          <Button variant="danger" size="sm" onClick={save} disabled={saving} className="shrink-0">
            {saving ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
      {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {content && (
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          {/* Business Identity */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Business Identity</p>
            </div>
            <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
              <Field label="Business name">
                <Input value={content.business_name ?? ""} onChange={(e) => field("business_name", e.target.value)} />
              </Field>
              <Field label="Category">
                <Input value={content.industry ?? ""} placeholder="Kirana / General Store" onChange={(e) => field("industry", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Textarea
                    value={content.positioning ?? ""}
                    placeholder="Your neighbourhood store with fresh groceries, daily essentials, and home delivery."
                    onChange={(e) => field("positioning", e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Website URL">
                  <Input value={content.website_url ?? ""} placeholder="https://yourbusiness.in" onChange={(e) => field("website_url", e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>

          {/* Contact */}
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Contact</p>
            <div className="mt-3 grid gap-3.5">
              <Field label="Address">
                <Textarea value={content.location ?? ""} placeholder="12, Main Road, Near HDFC Bank, Ahmedabad 380009" onChange={(e) => field("location", e.target.value)} />
              </Field>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Phone number">
                  <Input value={content.business_phone ?? ""} placeholder="+91 98250 12345" onChange={(e) => field("business_phone", e.target.value)} />
                </Field>
                <Field label="Email (optional)">
                  <Input type="email" value={content.business_email ?? ""} placeholder="hello@yourbusiness.in" onChange={(e) => field("business_email", e.target.value)} />
                </Field>
              </div>
              <Field label="Business hours">
                <Input
                  value={content.business_hours ?? ""}
                  placeholder="Mon–Sat: 8:00 AM – 9:30 PM"
                  onChange={(e) => field("business_hours", e.target.value)}
                />
              </Field>
              {weekendMissing && (
                <p className="text-xs font-medium text-sx-warning">⚠ Weekend hours not listed</p>
              )}
            </div>
          </Card>

          {/* Services — structured, replaces the old Catalog & Services
              chips and the old read-only Products display. */}
          <ServicesEditor services={content.services ?? []} onChange={(services) => field("services", services)} readOnly={readOnly} />

          {/* Business Highlights — a concise summary, not the service
              catalog (Section 2). Real length/count guidance shown
              inline, matching validateBrandBrainContent's own limits. */}
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Business Highlights</p>
            <p className="mt-1 text-xs text-sx-text-muted">
              A few short, punchy lines about your business — not a service description. e.g. &ldquo;Automated business growth platform focused on Social, SEO, and Websites.&rdquo;
            </p>
            <Textarea
              className="mt-3"
              value={(content.highlights ?? []).join("\n")}
              placeholder="e.g. Free delivery within 3 km"
              onChange={(e) => field("highlights", e.target.value.split("\n"))}
            />
            <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
              <span className={highlightsCount > HIGHLIGHTS_MAX_COUNT ? "font-semibold text-sx-danger" : "text-sx-text-subtle"}>
                {highlightsCount}/{HIGHLIGHTS_MAX_COUNT} lines
              </span>
              <span className="text-sx-text-subtle">Up to {HIGHLIGHT_MAX_LENGTH} characters per line</span>
            </div>
            {(content.highlights ?? []).some((h) => h.length > HIGHLIGHT_MAX_LENGTH) && (
              <p className="mt-1 text-[11px] font-medium text-sx-danger">One or more lines are too long — keep each highlight short, like a bullet point.</p>
            )}
          </Card>

          {/* Brand Identity: Logo & Brand Mark */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Brand Identity — Logo & Brand Mark</p>
              {typeof content.logo_url === "string" && content.logo_url && !readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    field("logo_url", undefined);
                    field("logo_transparent_url", undefined);
                    field("logo_variants", undefined);
                  }}
                  className="text-xs font-semibold text-sx-danger hover:underline"
                >
                  Remove Logo
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-4">
              {typeof content.logo_url === "string" && content.logo_url ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={content.logo_url} alt="Business logo" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-sx-md border border-dashed border-sx-border bg-sx-surface-2 text-lg font-bold text-sx-accent">
                  {String(content.business_name || active?.name || "SX").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-sx-text">
                  {typeof content.logo_url === "string" && content.logo_url ? "Custom logo uploaded" : "No custom logo set — using business initials"}
                </p>
                <p className="text-[11px] text-sx-text-subtle">
                  This logo appears in your customer header, social creatives, and audit reports.
                </p>
                {!readOnly && tenantId && (
                  <div className="mt-1 flex items-center gap-2">
                    <LogoAnalyzerFlow
                      tenantId={tenantId}
                      readOnly={readOnly}
                      // LogoAnalyzerFlow persists this itself (its own
                      // GET-merge-POST) -- reload the real saved state
                      // rather than staging it into `content` via field(),
                      // which would misleadingly mark it as an unsaved
                      // edit still waiting on this page's own Save
                      // Changes button when it's already been saved.
                      onSaved={() => void load()}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Photos & Gallery */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Photos & Logo</p>
              <button
                type="button"
                disabled={readOnly || uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="text-[12px] font-semibold text-sx-accent disabled:opacity-50"
              >
                {uploadingPhoto ? "Uploading…" : "Add"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadPhoto(file);
                }}
              />
            </div>
            {photosError && <p className="mt-2 text-xs text-sx-danger">{photosError}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-sx-sm bg-sx-surface-2">
                  {photo.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sx-sm border-[1.5px] border-dashed border-sx-accent/30 bg-sx-accent-muted text-sx-accent disabled:opacity-50"
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="text-[10px] font-semibold">Add Photo</span>
                </button>
              )}
            </div>
          </Card>

          {/* Digital Presence — real connector state, unchanged */}
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Digital Presence</p>
            <p className="mt-1 text-xs text-sx-text-muted">
              Live connection status and verified business destinations. Connect accounts to enable AI missions and autonomous publishing.
            </p>
            <div className="mt-3">
              {tenantId && (
                <DigitalPresenceCards tenantId={tenantId} readOnly={readOnly} returnPath="/app/brand" onStatusChange={load} />
              )}
            </div>
            <div className="mt-4 grid gap-3.5 sm:grid-cols-2 border-t border-sx-border pt-4">
              <Field label="Public channels / profiles (one per line)">
                <Textarea
                  value={(content.channels ?? []).join("\n")}
                  onChange={(e) => field("channels", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </div>
          </Card>

          {/* AI & Growth Context / Business Facts */}
          <section className="flex flex-col gap-3 pt-2">
            <h2 className="flex items-baseline gap-2 text-[19px] font-semibold text-sx-text">
              AI & Growth Context
              <span className="sx-hi text-xs font-normal text-sx-text-muted">व्यापार संदर्भ</span>
            </h2>
            <p className="text-xs text-sx-text-muted">The verified business context your missions and AI agents execute against.</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="p-4">
                <CardHeading>Audience</CardHeading>
                <Field label="Who you serve">
                  <Textarea value={content.target_audience ?? ""} onChange={(e) => field("target_audience", e.target.value)} />
                </Field>
              </Card>

              <Card className="p-4">
                <CardHeading>Brand voice</CardHeading>
                <Field label="Tone of voice">
                  <Textarea value={content.tone_of_voice ?? ""} onChange={(e) => field("tone_of_voice", e.target.value)} />
                </Field>
              </Card>

              <Card className="p-4">
                <CardHeading>Differentiators</CardHeading>
                <Field label="One per line — why customers choose you over the alternative">
                  <Textarea
                    value={(content.differentiators ?? []).join("\n")}
                    onChange={(e) => field("differentiators", e.target.value.split("\n").filter(Boolean))}
                  />
                </Field>
              </Card>

              <Card className="p-4">
                <CardHeading>Goals</CardHeading>
                <Field label="One per line — what you want the next 90 days to achieve">
                  <Textarea
                    value={(content.goals ?? []).join("\n")}
                    onChange={(e) => field("goals", e.target.value.split("\n").filter(Boolean))}
                  />
                </Field>
              </Card>

              <Card className="p-4">
                <CardHeading>Growth constraints</CardHeading>
                <Field label="Biggest constraint, previous attempts, or limits missions must respect">
                  <Textarea
                    value={typeof content.biggest_business_problem === "string" ? content.biggest_business_problem : ""}
                    onChange={(e) => field("biggest_business_problem", e.target.value)}
                  />
                </Field>
              </Card>

              <Card className="p-4">
                <CardHeading>Pillars</CardHeading>
                <Field label="One per line">
                  <Textarea value={(content.pillars ?? []).join("\n")} onChange={(e) => field("pillars", e.target.value.split("\n").filter(Boolean))} />
                </Field>
              </Card>

              <Card className="p-4 sm:col-span-2">
                <CardHeading>Rules</CardHeading>
                <Field label="One per line — things missions must never do or say">
                  <Textarea value={(content.rules ?? []).join("\n")} onChange={(e) => field("rules", e.target.value.split("\n").filter(Boolean))} />
                </Field>
              </Card>
            </div>

            <Card className="p-4">
              <CardHeading>Verified sources</CardHeading>
              <p className="mt-1 text-xs text-sx-text-muted">
                Provenance is preserved from Audit discovery and customer edits. Brand Brain versions stay append-only — saving creates a new version rather than rewriting history.
              </p>
            </Card>
          </section>
        </fieldset>
      )}
    </div>
  );
}
