"use client";

import { useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

export interface IntakeOrder {
  business_name: string | null;
  industry: string | null;
  website_url: string | null;
  deep_dive_answers: Record<string, string> | null;
  goals_answers: Record<string, string> | null;
}

type Phase = "business" | "deep_dive" | "goals";

const PLACEHOLDER = "Pending — completed in intake";

/**
 * The three post-payment intake phases. Deliberately not exhaustive against
 * every field the brief lists — a working, genuinely conditional set that
 * covers the cases the brief calls out explicitly (no ads → skip ad
 * questions; not selling online → skip ecommerce questions) rather than a
 * long flat form.
 *
 * Each phase saves via PATCH /api/platform/audit/intake on "Continue" —
 * autosave-on-step-change, not on every keystroke, so a slow connection
 * doesn't turn typing into a race.
 */
export function IntakeWizard({ order, onIntakeComplete }: { order: IntakeOrder; onIntakeComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (!order.business_name || order.business_name === PLACEHOLDER || !order.industry || !order.website_url) return "business";
    const dd = order.deep_dive_answers ?? {};
    if (!dd.idealCustomers || !dd.majorProducts || !dd.competitors || !dd.leadSources || !dd.differentiation) return "deep_dive";
    return "goals";
  });

  const [business, setBusiness] = useState({
    businessName: order.business_name === PLACEHOLDER ? "" : order.business_name ?? "",
    industry: order.industry ?? "",
    websiteUrl: order.website_url ?? "",
    businessType: (order.deep_dive_answers?.businessType as string) ?? "",
    yearsOperating: (order.deep_dive_answers?.yearsOperating as string) ?? "",
    location: (order.deep_dive_answers?.location as string) ?? "",
  });

  const existingGst = (order.deep_dive_answers as { gstInvoice?: Record<string, string> } | null)?.gstInvoice;
  const [wantsGstInvoice, setWantsGstInvoice] = useState(Boolean(existingGst));
  const [gstInvoice, setGstInvoice] = useState({
    legalBusinessName: existingGst?.legalBusinessName ?? "",
    gstin: existingGst?.gstin ?? "",
    billingAddress: existingGst?.billingAddress ?? "",
    state: existingGst?.state ?? "",
    pin: existingGst?.pin ?? "",
  });

  const [deepDive, setDeepDive] = useState({
    idealCustomers: order.deep_dive_answers?.idealCustomers ?? "",
    majorProducts: order.deep_dive_answers?.majorProducts ?? "",
    pricingRange: order.deep_dive_answers?.pricingRange ?? "",
    competitors: order.deep_dive_answers?.competitors ?? "",
    leadSources: order.deep_dive_answers?.leadSources ?? "",
    runsAds: order.deep_dive_answers?.runsAds ?? "no",
    adSpend: order.deep_dive_answers?.adSpend ?? "",
    sellsOnline: order.deep_dive_answers?.sellsOnline ?? "no",
    ecommercePlatform: order.deep_dive_answers?.ecommercePlatform ?? "",
    salesProcess: order.deep_dive_answers?.salesProcess ?? "",
    differentiation: order.deep_dive_answers?.differentiation ?? "",
    currentProblems: order.deep_dive_answers?.currentProblems ?? "",
    geographicReach: order.deep_dive_answers?.geographicReach ?? "",
  });

  const [goals, setGoals] = useState({
    successDefinition: order.goals_answers?.successDefinition ?? "",
    biggestObstacle: order.goals_answers?.biggestObstacle ?? "",
    topPriorities: order.goals_answers?.topPriorities ?? "",
    desiredGeography: order.goals_answers?.desiredGeography ?? "",
    desiredCustomer: order.goals_answers?.desiredCustomer ?? "",
    triedAlready: order.goals_answers?.triedAlready ?? "",
    approxBudget: order.goals_answers?.approxBudget ?? "",
    timeframe: order.goals_answers?.timeframe ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(p: Phase, data: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: p, data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save. Please try again.");
        return false;
      }
      return true;
    } catch {
      setError("Network error saving your answers. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueFromBusiness() {
    if (!business.businessName.trim() || !business.industry.trim() || !business.websiteUrl.trim()) {
      setError("Business name, industry, and website are required.");
      return;
    }
    const ok = await save("business", { ...business, ...(wantsGstInvoice ? { gstInvoice } : {}) });
    if (!ok) return;
    trackFunnel("audit_business_completed", { surface: "audit_intake" });
    setPhase("deep_dive");
  }

  async function continueFromDeepDive() {
    if (![deepDive.idealCustomers, deepDive.majorProducts, deepDive.competitors, deepDive.leadSources, deepDive.differentiation].every((value) => value.trim())) {
      setError("Complete the required customer, offering, competitor, lead source, and differentiation fields.");
      return;
    }
    const ok = await save("deep_dive", deepDive);
    if (!ok) return;
    trackFunnel("audit_deep_dive_completed", { surface: "audit_intake" });
    setPhase("goals");
  }

  async function continueFromGoals() {
    if (![goals.successDefinition, goals.biggestObstacle, goals.topPriorities].every((value) => value.trim())) {
      setError("Success definition, biggest obstacle, and top priorities are required.");
      return;
    }
    const ok = await save("goals", goals);
    if (!ok) return;
    trackFunnel("audit_goals_completed", { surface: "audit_intake" });
    onIntakeComplete();
  }

  return (
    <Card>
      <CardHeading>
        {phase === "business" ? "Phase 1 · Your Business" : phase === "deep_dive" ? "Phase 2 · Business Deep Dive" : "Phase 3 · Goals"}
      </CardHeading>
      <p className="mt-1 text-xs text-sx-text-subtle">
        {phase === "business"
          ? "The basics — this is what your report is built around."
          : phase === "deep_dive"
            ? "A closer look at how your business actually runs today."
            : "What would make the next 90 days a success? This is what shapes the recommendations."}
      </p>

      {error && (
        <div className="mt-3">
          <ErrorState message={error} />
        </div>
      )}

      {phase === "business" && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              <Input value={business.businessName} onChange={(e) => setBusiness((b) => ({ ...b, businessName: e.target.value }))} />
            </Field>
            <Field label="Industry">
              <Input value={business.industry} onChange={(e) => setBusiness((b) => ({ ...b, industry: e.target.value }))} />
            </Field>
            <Field label="Website">
              <Input placeholder="yourbusiness.in" value={business.websiteUrl} onChange={(e) => setBusiness((b) => ({ ...b, websiteUrl: e.target.value }))} />
            </Field>
            <Field label="Location / markets">
              <Input placeholder="Raipur, Chhattisgarh" value={business.location} onChange={(e) => setBusiness((b) => ({ ...b, location: e.target.value }))} />
            </Field>
            <Field label="Business type">
              <Select value={business.businessType} onChange={(e) => setBusiness((b) => ({ ...b, businessType: e.target.value }))}>
                <option value="">Select…</option>
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <Field label="Years operating">
              <Input placeholder="e.g. 3" value={business.yearsOperating} onChange={(e) => setBusiness((b) => ({ ...b, yearsOperating: e.target.value }))} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs text-sx-text-muted">
            <input type="checkbox" checked={wantsGstInvoice} onChange={(e) => setWantsGstInvoice(e.target.checked)} className="h-4 w-4" />
            Need a GST invoice?
          </label>
          {wantsGstInvoice && (
            <div className="grid gap-3 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 sm:grid-cols-2">
              <Field label="Legal business name">
                <Input value={gstInvoice.legalBusinessName} onChange={(e) => setGstInvoice((g) => ({ ...g, legalBusinessName: e.target.value }))} />
              </Field>
              <Field label="GSTIN">
                <Input value={gstInvoice.gstin} onChange={(e) => setGstInvoice((g) => ({ ...g, gstin: e.target.value }))} />
              </Field>
              <Field label="Billing address">
                <Input value={gstInvoice.billingAddress} onChange={(e) => setGstInvoice((g) => ({ ...g, billingAddress: e.target.value }))} />
              </Field>
              <Field label="State">
                <Input value={gstInvoice.state} onChange={(e) => setGstInvoice((g) => ({ ...g, state: e.target.value }))} />
              </Field>
              <Field label="PIN code">
                <Input value={gstInvoice.pin} onChange={(e) => setGstInvoice((g) => ({ ...g, pin: e.target.value }))} />
              </Field>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="primary" size="touch" onClick={continueFromBusiness} disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      )}

      {phase === "deep_dive" && (
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Who are your ideal customers?">
            <Textarea value={deepDive.idealCustomers} onChange={(e) => setDeepDive((d) => ({ ...d, idealCustomers: e.target.value }))} />
          </Field>
          <Field label="Your major products or services">
            <Textarea value={deepDive.majorProducts} onChange={(e) => setDeepDive((d) => ({ ...d, majorProducts: e.target.value }))} />
          </Field>
          <Field label="Typical pricing range (optional)">
            <Input value={deepDive.pricingRange} onChange={(e) => setDeepDive((d) => ({ ...d, pricingRange: e.target.value }))} />
          </Field>
          <Field label="Who are your main competitors?">
            <Textarea value={deepDive.competitors} onChange={(e) => setDeepDive((d) => ({ ...d, competitors: e.target.value }))} />
          </Field>
          <Field label="Where do most of your leads come from today?">
            <Textarea value={deepDive.leadSources} onChange={(e) => setDeepDive((d) => ({ ...d, leadSources: e.target.value }))} />
          </Field>

          <Field label="Do you currently run paid ads?">
            <Select value={deepDive.runsAds} onChange={(e) => setDeepDive((d) => ({ ...d, runsAds: e.target.value }))}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          {deepDive.runsAds === "yes" && (
            <Field label="Roughly what's your monthly ad spend? (optional)">
              <Input value={deepDive.adSpend} onChange={(e) => setDeepDive((d) => ({ ...d, adSpend: e.target.value }))} />
            </Field>
          )}

          <Field label="Do you sell online?">
            <Select value={deepDive.sellsOnline} onChange={(e) => setDeepDive((d) => ({ ...d, sellsOnline: e.target.value }))}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          {deepDive.sellsOnline === "yes" && (
            <Field label="Which platform? (optional)">
              <Input placeholder="Shopify, WooCommerce, Instagram checkout…" value={deepDive.ecommercePlatform} onChange={(e) => setDeepDive((d) => ({ ...d, ecommercePlatform: e.target.value }))} />
            </Field>
          )}

          <Field label="What does your sales process look like once a lead comes in? (optional)">
            <Textarea value={deepDive.salesProcess} onChange={(e) => setDeepDive((d) => ({ ...d, salesProcess: e.target.value }))} />
          </Field>
          <Field label="What makes you different from the competitors above?">
            <Textarea value={deepDive.differentiation} onChange={(e) => setDeepDive((d) => ({ ...d, differentiation: e.target.value }))} />
          </Field>
          <Field label="What's the biggest problem in the business right now? (optional)">
            <Textarea value={deepDive.currentProblems} onChange={(e) => setDeepDive((d) => ({ ...d, currentProblems: e.target.value }))} />
          </Field>
          <Field label="Geographic reach — local, regional, national? (optional)">
            <Input value={deepDive.geographicReach} onChange={(e) => setDeepDive((d) => ({ ...d, geographicReach: e.target.value }))} />
          </Field>

          <div className="flex justify-between">
            <Button variant="ghost" size="touch" onClick={() => setPhase("business")}>Back</Button>
            <Button variant="primary" size="touch" onClick={continueFromDeepDive} disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      )}

      {phase === "goals" && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
            These next questions are commercial, not just descriptive — budget and timeframe shape which recommendations are
            actually realistic for you, not just theoretically good ideas.
          </p>
          <Field label="What would make the next 90 days a success?">
            <Textarea value={goals.successDefinition} onChange={(e) => setGoals((g) => ({ ...g, successDefinition: e.target.value }))} />
          </Field>
          <Field label="What's the biggest obstacle in your way right now?">
            <Textarea value={goals.biggestObstacle} onChange={(e) => setGoals((g) => ({ ...g, biggestObstacle: e.target.value }))} />
          </Field>
          <Field label="Top 3 priorities, in order">
            <Textarea value={goals.topPriorities} onChange={(e) => setGoals((g) => ({ ...g, topPriorities: e.target.value }))} />
          </Field>
          <Field label="Desired geography for growth (optional)">
            <Input value={goals.desiredGeography} onChange={(e) => setGoals((g) => ({ ...g, desiredGeography: e.target.value }))} />
          </Field>
          <Field label="Desired customer profile, if different from today (optional)">
            <Textarea value={goals.desiredCustomer} onChange={(e) => setGoals((g) => ({ ...g, desiredCustomer: e.target.value }))} />
          </Field>
          <Field label="What have you already tried, and what happened? (optional)">
            <Textarea value={goals.triedAlready} onChange={(e) => setGoals((g) => ({ ...g, triedAlready: e.target.value }))} />
          </Field>
          <Field label="Approximate monthly growth/marketing budget (optional)">
            <Input value={goals.approxBudget} onChange={(e) => setGoals((g) => ({ ...g, approxBudget: e.target.value }))} />
          </Field>
          <Field label="Timeframe you're working towards (optional)">
            <Input value={goals.timeframe} onChange={(e) => setGoals((g) => ({ ...g, timeframe: e.target.value }))} />
          </Field>

          <div className="flex justify-between">
            <Button variant="ghost" size="touch" onClick={() => setPhase("deep_dive")}>Back</Button>
            <Button variant="primary" size="touch" onClick={continueFromGoals} disabled={saving}>
              {saving ? "Saving…" : "Finish intake"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
