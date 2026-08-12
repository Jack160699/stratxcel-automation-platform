"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/brand?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load Brand Brain (HTTP ${res.status})`);
      return;
    }
    setContent(body.brandBrain?.content ?? EMPTY);
    setVersion(body.brandBrain?.current_version ?? 0);
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
      const res = await fetch("/api/platform/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, content }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to save (HTTP ${res.status})`);
        return;
      }
      setVersion(body.version.version);
      setSaved(true);
      trackFunnel("brand_brain_completed", { surface: "app_brand" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Brand Brain{active ? ` — ${active.name}` : ""}</h1>
          <p className="mt-1 text-sm text-sx-text-muted">
            {version != null ? `Version ${version}` : "—"} · the context every mission is compiled against.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={readOnly || saving || !content}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </header>

      {error && <ErrorState message={error} />}
      {tenantId && content === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {content && (
        <fieldset disabled={readOnly} className="contents">
          <Card>
            <CardHeading>Business</CardHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Business name">
                <Input value={content.business_name ?? ""} onChange={(e) => field("business_name", e.target.value)} />
              </Field>
              <Field label="Industry">
                <Input value={content.industry ?? ""} onChange={(e) => field("industry", e.target.value)} />
              </Field>
              <Field label="Website">
                <Input
                  value={content.website_url ?? ""}
                  placeholder="yourbusiness.in"
                  onChange={(e) => field("website_url", e.target.value)}
                />
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
            <CardHeading>Positioning</CardHeading>
            <Field label="In one or two sentences, what do you do and for whom?">
              <Textarea value={content.positioning ?? ""} onChange={(e) => field("positioning", e.target.value)} />
            </Field>
          </Card>

          <Card>
            <CardHeading>Voice</CardHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Tone of voice">
                <Textarea value={content.tone_of_voice ?? ""} onChange={(e) => field("tone_of_voice", e.target.value)} />
              </Field>
              <Field label="Target audience">
                <Textarea value={content.target_audience ?? ""} onChange={(e) => field("target_audience", e.target.value)} />
              </Field>
            </div>
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
            <CardHeading>Channels</CardHeading>
            <Field label="One per line — where you reach customers today (Instagram, WhatsApp, Google, referrals…)">
              <Textarea
                value={(content.channels ?? []).join("\n")}
                onChange={(e) => field("channels", e.target.value.split("\n").filter(Boolean))}
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

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Products</h2>
            {(content.products ?? []).length === 0 ? (
              <EmptyState title="No products listed." subtitle="Product/service editing is a follow-up to this pass." />
            ) : (
              <div className="flex flex-col gap-2">
                {content.products!.map((p) => (
                  <Card key={p.name} variant="nested">
                    <p className="font-medium text-sx-text">{p.name}</p>
                    <p className="mt-1 text-xs text-sx-text-subtle">{p.description}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </fieldset>
      )}
    </div>
  );
}
