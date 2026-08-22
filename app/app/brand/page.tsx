"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import { DigitalPresenceCards } from "@/components/audit/DigitalPresenceCards";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";

interface BrandBrainContent {
  business_name?: string;
  industry?: string;
  website_url?: string;
  location?: string;
  /** Shop-facing contact number — StratXcel App reference's Location & Hours row. Distinct from the WhatsApp OTP-verified number (Connected Accounts); this is a plain display field for the shop's public phone line, no verification. */
  business_phone?: string;
  /** Weekly hours as one free-text line (e.g. "Mon–Sat: 8:00 AM – 9:30 PM") — kept as a single field like every other Brand Brain string, not a structured per-day schema. */
  business_hours?: string;
  /** Short catalog/service tags — Brand Center's "Catalog & Services" chips. */
  catalog_tags?: string[];
  /** Short highlight lines — Brand Center's "Business Highlights". */
  highlights?: string[];
  positioning?: string;
  tone_of_voice?: string;
  target_audience?: string;
  differentiators?: string[];
  goals?: string[];
  channels?: string[];
  pillars?: string[];
  rules?: string[];
  products?: { name: string; description: string }[];
  biggest_business_problem?: string;
  [key: string]: unknown;
}

interface ShopPhoto {
  id: string;
  name: string;
  url: string | null;
}

const EMPTY: BrandBrainContent = {};

/** Weekend-hours check for the Brand Center screen's warning — a real, deterministic read of the business_hours text (no fabricated static warning). */
function missingWeekendHours(hours: string | undefined): boolean {
  if (!hours || !hours.trim()) return true;
  return !/sat|sun|weekend/i.test(hours);
}

/**
 * Brand Center — StratXcel App reference (Claude Design project
 * 6c2ad0a0-c8c8-47d1-a79d-3a1b255a7b01, "Brand Center" screen). Rebuilt
 * around that reference's card composition (Business Info, Location &
 * Hours, Catalog & Services, Business Highlights, Photos & Logo, Digital
 * Presence) using the real, tenant-scoped Brand Brain content —
 * @stratxcel/brand-brain's versioned tables and this same load/save flow
 * predate this pass and are unchanged. business_hours/catalog_tags/
 * highlights are new optional keys on the same flexible jsonb content
 * blob (no migration needed — see packages/brand-brain's
 * `[key: string]: unknown`). Photos reuse the existing social_media_assets
 * storage the AI-reference-image feature already established (see
 * app/api/platform/brand/photos/route.ts). The deeper AI-context fields
 * (positioning, tone, differentiators, goals, pillars, rules — what
 * missions and AI agents execute against) are preserved in full below,
 * not deleted, just moved out of the primary identity section the
 * reference actually specifies.
 */
export default function BrandPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const readOnly = active?.accessMode === "staff_support";
  const [content, setContent] = useState<BrandBrainContent | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadSequence = useRef(0);

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
      "We couldn't load your Brand details right now."
    );
    if (requestId !== loadSequence.current) return;
    setLoading(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setContent(result.data.brandBrain?.content ?? EMPTY);
    setVersion(result.data.brandBrain?.current_version ?? 0);
  }

  async function loadPhotos() {
    if (!tenantId) return;
    setPhotosError(null);
    const result = await loadCustomerJson<{ photos: ShopPhoto[] }>(
      () => fetch(`/api/platform/brand/photos?tenantId=${encodeURIComponent(tenantId)}`),
      "We couldn't load your brand photos right now."
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

  function field<K extends keyof BrandBrainContent>(key: K, value: BrandBrainContent[K]) {
    setContent((c) => ({ ...(c ?? EMPTY), [key]: value }));
    setSaved(false);
  }

  async function save() {
    if (!tenantId || !content) return;
    setSaving(true);
    setError(null);
    try {
      const result = await loadCustomerJson<{ version: { version: number } }>(
        () =>
          fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          }),
        "We couldn't save your Brand details right now."
      );
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setVersion(result.data.version.version);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      trackFunnel("brand_brain_completed", { surface: "app_brand" });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!tenantId || readOnly) return;
    setUploadingPhoto(true);
    setPhotosError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tenantId", tenantId);
      const res = await fetch("/api/platform/brand/photos", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhotosError(data.error || "We couldn't upload your photo right now.");
        return;
      }
      if (data.photo) {
        setPhotos((prev) => [data.photo, ...prev]);
        if (!content?.logo_url) {
          field("logo_url", data.photo.public_url);
        }
      }
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

  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <header className="flex flex-col gap-1">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-sx-text">Brand Center{active ? ` · ${active.name}` : ""}</h1>
            <p className="text-xs text-sx-text-subtle">Manage your business profile, operating hours, brand voice, and logo mark</p>
          </div>
          <Button variant="primary" size="cta" onClick={save} disabled={readOnly || saving || !content}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
          </Button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {content && (
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          {/* Business Information */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Business Information</p>
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
            </div>
          </Card>

          {/* Location & Hours */}
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Location & Hours</p>
            <div className="mt-3 grid gap-3.5">
              <Field label="Address">
                <Textarea value={content.location ?? ""} placeholder="12, Main Road, Near HDFC Bank, Ahmedabad 380009" onChange={(e) => field("location", e.target.value)} />
              </Field>
              <Field label="Phone number">
                <Input value={content.business_phone ?? ""} placeholder="+91 98250 12345" onChange={(e) => field("business_phone", e.target.value)} />
              </Field>
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

          {/* Catalog & Services */}
          <TagListCard
            title="Catalog & Services"
            values={content.catalog_tags ?? []}
            onChange={(v) => field("catalog_tags", v)}
            addLabel="+ Add"
            placeholder="e.g. Groceries"
          />

          {/* Business Highlights */}
          <ListLinesCard
            title="Business Highlights"
            values={content.highlights ?? []}
            onChange={(v) => field("highlights", v)}
            placeholder="e.g. Free delivery within 3 km"
          />

          {/* Brand Logo & Business Mark */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Business Logo & Brand Mark</p>
              {typeof content.logo_url === "string" && content.logo_url && !readOnly && (
                <button
                  type="button"
                  onClick={() => field("logo_url", undefined)}
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
                {!readOnly && (
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-sx-xs bg-sx-surface-2 border border-sx-border px-2.5 py-1 text-xs font-semibold text-sx-text hover:bg-sx-surface-3 transition-colors"
                    >
                      {typeof content.logo_url === "string" && content.logo_url ? "Replace Logo" : "Upload Logo"}
                    </button>
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
              <Field label="Website URL">
                <Input value={content.website_url ?? ""} placeholder="https://yourbusiness.in" onChange={(e) => field("website_url", e.target.value)} />
              </Field>
              <Field label="Public channels / profiles (one per line)">
                <Textarea
                  value={(content.channels ?? []).join("\n")}
                  onChange={(e) => field("channels", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </div>
          </Card>

          {/* Products / services — existing, real */}
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Products & Services</p>
            {(content.products ?? []).length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No products listed." subtitle="Product/service editing is a follow-up to this pass." />
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {content.products!.map((p) => (
                  <div key={p.name} className="rounded-sx-sm bg-sx-surface-2 p-3">
                    <p className="text-sm font-semibold text-sx-text">{p.name}</p>
                    <p className="mt-1 text-xs text-sx-text-subtle">{p.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* AI & Growth Context */}
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

function TagListCard({
  title,
  values,
  onChange,
  addLabel,
  placeholder,
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  addLabel: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v) onChange([...values, v]);
    setDraft("");
  }
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">{title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {values.map((tag, idx) => (
          <span key={`${tag}-${idx}`} className="inline-flex items-center gap-1.5 rounded-sx-sm bg-sx-surface-2 px-3 py-1.5 text-[13px] text-sx-text-muted">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(values.filter((_, i) => i !== idx))} className="text-sx-text-subtle hover:text-sx-danger">
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 rounded-sx-sm bg-transparent px-1 py-1.5 text-[13px] text-sx-text outline-none placeholder:text-sx-text-subtle"
        />
      </div>
      <p className="mt-1 text-[11px] text-sx-text-subtle">{addLabel} — press Enter to add</p>
    </Card>
  );
}

function ListLinesCard({
  title,
  values,
  onChange,
  placeholder,
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">{title}</p>
      <Textarea
        className="mt-3"
        value={values.join("\n")}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.split("\n").filter(Boolean))}
      />
    </Card>
  );
}
