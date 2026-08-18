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

interface BrandBrainContent {
  business_name?: string;
  industry?: string;
  website_url?: string;
  location?: string;
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

const EMPTY: BrandBrainContent = {};

/**
 * Real, tenant-scoped Brand Brain editor — @stratxcel/brand-brain and its
 * versioned tables already existed with no page or API route consuming
 * them (see app/api/platform/brand/route.ts). Distinct from Social
 * Autopilot's owner-scoped app/admin/social/brand — this one is genuinely
 * per-client, gated on brand_brain:view/brand_brain:edit like every other
 * tenant-scoped page here. Products editing stays read-only in this pass
 * (nested list editor is a follow-up, not core to the field).
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

  async function load() {
    if (!tenantId) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setContent(null);
    setVersion(null);
    const result = await loadCustomerJson<{ brandBrain?: { content?: BrandBrainContent; current_version?: number } | null }>(
      () => fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`),
      "We couldn't load your Brand Brain. Please try again."
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

  useEffect(() => {
    load();
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
          fetch("/api/platform/brand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId, content }),
          }),
        "We couldn't save your Brand Brain. Please try again."
      );
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setVersion(result.data.version.version);
      setSaved(true);
      trackFunnel("brand_brain_completed", { surface: "app_brand" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sx-border/80 pb-4">
        <div>
          <h1 className="font-sx-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-sx-text">
            Business Profile{active ? ` · ${active.name}` : ""}
          </h1>
          <p className="mt-0.5 text-[14px] text-sx-text-muted">
            {version != null ? `Brand Brain Version ${version}` : "—"} · the verified business context your missions and AI agents execute against.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="touch" onClick={save} disabled={readOnly || saving || !content} className="px-5 font-bold">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
          </Button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {content && (
        <fieldset disabled={readOnly} className="space-y-6">
          <Card>
            <CardHeading>Business identity</CardHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Business name">
                <Input value={content.business_name ?? ""} onChange={(e) => field("business_name", e.target.value)} />
              </Field>
              <Field label="Industry">
                <Input value={content.industry ?? ""} onChange={(e) => field("industry", e.target.value)} />
              </Field>
              <Field label="Location / market">
                <Input
                  value={content.location ?? ""}
                  placeholder="Raipur, Chhattisgarh"
                  onChange={(e) => field("location", e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeading>Digital presence</CardHeading>
            <p className="mt-1 text-xs text-sx-text-muted">
              Live connection status and verified business destinations. Connect accounts to enable AI missions and autonomous publishing.
            </p>
            <div className="mt-3">
              {tenantId && (
                <DigitalPresenceCards
                  tenantId={tenantId}
                  readOnly={readOnly}
                  returnPath="/app/brand"
                  onStatusChange={load}
                />
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 pt-3 border-t border-sx-border/40">
              <Field label="Website URL">
                <Input
                  value={content.website_url ?? ""}
                  placeholder="https://yourbusiness.in"
                  onChange={(e) => field("website_url", e.target.value)}
                />
              </Field>
              <Field label="Public channels / profiles (one per line)">
                <Textarea
                  value={(content.channels ?? []).join("\n")}
                  onChange={(e) => field("channels", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </div>
          </Card>

          {/* Strategic Context Grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeading>Positioning</CardHeading>
              <Field label="In one or two sentences, what do you do and for whom?">
                <Textarea value={content.positioning ?? ""} onChange={(e) => field("positioning", e.target.value)} />
              </Field>
            </Card>

            <Card>
              <CardHeading>Audience</CardHeading>
              <Field label="Who you serve">
                <Textarea value={content.target_audience ?? ""} onChange={(e) => field("target_audience", e.target.value)} />
              </Field>
            </Card>

            <Card>
              <CardHeading>Brand voice</CardHeading>
              <Field label="Tone of voice">
                <Textarea value={content.tone_of_voice ?? ""} onChange={(e) => field("tone_of_voice", e.target.value)} />
              </Field>
            </Card>

            <Card>
              <CardHeading>Differentiators</CardHeading>
              <Field label="One per line — why customers choose you over the alternative">
                <Textarea
                  value={(content.differentiators ?? []).join("\n")}
                  onChange={(e) => field("differentiators", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </Card>

            <Card>
              <CardHeading>Goals</CardHeading>
              <Field label="One per line — what you want the next 90 days to achieve">
                <Textarea
                  value={(content.goals ?? []).join("\n")}
                  onChange={(e) => field("goals", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </Card>

            <Card>
              <CardHeading>Growth constraints</CardHeading>
              <Field label="Biggest constraint, previous attempts, or limits missions must respect">
                <Textarea
                  value={typeof content.biggest_business_problem === "string" ? content.biggest_business_problem : ""}
                  onChange={(e) => field("biggest_business_problem", e.target.value)}
                />
              </Field>
            </Card>

            <Card>
              <CardHeading>Pillars</CardHeading>
              <Field label="One per line">
                <Textarea
                  value={(content.pillars ?? []).join("\n")}
                  onChange={(e) => field("pillars", e.target.value.split("\n").filter(Boolean))}
                />
              </Field>
            </Card>

            <Card>
              <CardHeading>Rules</CardHeading>
              <Field label="One per line — things missions must never do or say">
                <Textarea value={(content.rules ?? []).join("\n")} onChange={(e) => field("rules", e.target.value.split("\n").filter(Boolean))} />
              </Field>
            </Card>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Products / services</h2>
            {(content.products ?? []).length === 0 ? (
              <EmptyState title="No products listed." subtitle="Product/service editing is a follow-up to this pass." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.products!.map((p) => (
                  <Card key={p.name} variant="nested">
                    <p className="font-medium text-sx-text">{p.name}</p>
                    <p className="mt-1 text-xs text-sx-text-subtle">{p.description}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Card>
            <CardHeading>Verified sources</CardHeading>
            <p className="mt-1 text-xs text-sx-text-muted">
              Provenance is preserved from Audit discovery and customer edits. Brand Brain versions stay append-only — saving creates a new version rather than rewriting history.
            </p>
          </Card>
        </fieldset>
      )}
    </div>
  );
}
