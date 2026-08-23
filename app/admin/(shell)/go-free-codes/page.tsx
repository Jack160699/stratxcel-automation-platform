"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { StatusChip } from "@/components/ui/StatusChip";

interface PromoCodeRow {
  id: string;
  code_display: string;
  code_prefix: string;
  productLabel: string;
  discount_percent: number;
  max_redemptions: number | null;
  max_redemptions_per_customer: number;
  valid_from: string;
  expires_at: string | null;
  allowed_email: string | null;
  is_active: boolean;
  internal_note: string | null;
  created_by: string | null;
  created_at: string;
  redemptionCount: number;
}

interface CreatedCode {
  id: string;
  codeDisplay: string;
  productLabel: string;
  discountPercent: number;
  redemptionCount: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
}

interface RedemptionRow {
  id: string;
  tenant_id: string;
  customer_email: string;
  audit_order_id: string | null;
  subscription_id: string | null;
  list_price_cents: number;
  discount_cents: number;
  amount_due_cents: number;
  redeemed_at: string;
}

type ProductScope = "audit_fee" | "subscription_payment";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function GoFreeCodesPage() {
  const [codes, setCodes] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CreatedCode | null>(null);
  const [redemptionsFor, setRedemptionsFor] = useState<{ id: string; code: string; rows: RedemptionRow[] } | null>(null);

  const [scopeFilter, setScopeFilter] = useState<"all" | ProductScope>("all");
  const [productScope, setProductScope] = useState<ProductScope>("audit_fee");
  const [generate, setGenerate] = useState(true);
  const [customCode, setCustomCode] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [maxPerCustomer, setMaxPerCustomer] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowedEmail, setAllowedEmail] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/admin/promo-codes?scope=${scopeFilter}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load Go Free codes");
        setCodes([]);
        return;
      }
      setCodes(body.codes ?? []);
    } catch {
      setError("Network error loading Go Free codes");
    } finally {
      setLoading(false);
    }
  }, [scopeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generate,
          productScope,
          customCode: generate ? undefined : customCode,
          maxRedemptions: Number(maxUses) || 1,
          maxRedemptionsPerCustomer: Number(maxPerCustomer) || 1,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          allowedEmail: allowedEmail.trim() || null,
          internalNote: internalNote.trim() || null,
          isActive: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create code");
        setSaving(false);
        return;
      }
      setCreated(body.code);
      setShowCreate(false);
      setCustomCode("");
      setInternalNote("");
      setAllowedEmail("");
      setExpiresAt("");
      setMaxUses("1");
      await load();
    } catch {
      setError("Network error creating code");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    setError(null);
    const res = await fetch(`/api/platform/admin/promo-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not update code");
      return;
    }
    await load();
  }

  async function viewRedemptions(row: PromoCodeRow) {
    setError(null);
    const res = await fetch(`/api/platform/admin/promo-codes/${row.id}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not load redemptions");
      return;
    }
    setRedemptionsFor({ id: row.id, code: row.code_display, rows: body.redemptions ?? [] });
  }

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sx-text-subtle">Billing / Payments</p>
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Go Free Codes</h1>
          <p className="mt-1 max-w-2xl text-sm text-sx-text-muted">
            Create one-time complimentary codes for approved test/trial activation of the ₹999 Business Growth Audit or a self-service
            subscription plan (Starter / Growth / Business). No Razorpay charge, no revenue, no paid invoice — always classified as a
            test/trial activation.
          </p>
        </div>
        <Button type="button" variant="primary" size="touch" onClick={() => { setShowCreate(true); setCreated(null); }}>
          + Create Go Free Code
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-sx-text-subtle">Show</p>
        {(["all", "audit_fee", "subscription_payment"] as const).map((s) => (
          <Button
            key={s}
            type="button"
            variant={scopeFilter === s ? "primary" : "secondary"}
            size="sm"
            onClick={() => setScopeFilter(s)}
          >
            {s === "all" ? "All" : s === "audit_fee" ? "Audit" : "Subscription"}
          </Button>
        ))}
      </div>

      {error && <ErrorState message={error} />}

      {created && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <h2 className="font-sx-sans text-sm font-semibold uppercase tracking-wide text-sx-text-subtle">Go Free code created</h2>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-wide text-sx-text">{created.codeDisplay}</p>
          <dl className="mt-4 grid gap-2 text-sm text-sx-text-muted sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-sx-text-subtle">Product</dt><dd className="text-sx-text">{created.productLabel}</dd></div>
            <div><dt className="text-xs uppercase text-sx-text-subtle">Discount</dt><dd className="text-sx-text">{created.discountPercent}%</dd></div>
            <div><dt className="text-xs uppercase text-sx-text-subtle">Uses</dt><dd className="text-sx-text">{created.redemptionCount} / {created.maxRedemptions ?? "∞"}</dd></div>
            <div><dt className="text-xs uppercase text-sx-text-subtle">Expires</dt><dd className="text-sx-text">{formatWhen(created.expiresAt)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => copyCode(created.codeDisplay)}>Copy Code</Button>
            <Button type="button" variant="secondary" onClick={() => setActive(created.id, false)}>Disable</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => viewRedemptions({
                id: created.id,
                code_display: created.codeDisplay,
                code_prefix: created.codeDisplay.slice(0, 5),
                productLabel: created.productLabel,
                discount_percent: created.discountPercent,
                max_redemptions: created.maxRedemptions,
                max_redemptions_per_customer: 1,
                valid_from: new Date().toISOString(),
                expires_at: created.expiresAt,
                allowed_email: null,
                is_active: true,
                internal_note: null,
                created_by: null,
                created_at: new Date().toISOString(),
                redemptionCount: created.redemptionCount,
              })}
            >
              View Redemptions
            </Button>
          </div>
        </section>
      )}

      {showCreate && (
        <form onSubmit={createCode} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <h2 className="font-sx-sans text-lg font-semibold text-sx-text">Create Go Free Code</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-sx-text-subtle">Product</p>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-sx-text">
                  <input type="radio" checked={productScope === "audit_fee"} onChange={() => setProductScope("audit_fee")} />
                  Business Growth Audit — ₹999
                </label>
                <label className="flex items-center gap-2 text-sm text-sx-text">
                  <input type="radio" checked={productScope === "subscription_payment"} onChange={() => setProductScope("subscription_payment")} />
                  Subscription plan — customer picks Starter (₹2,999) / Growth (₹7,999) / Business (₹15,999) at activation
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-sx-text">
                <input type="radio" checked={generate} onChange={() => setGenerate(true)} />
                Generate code ({productScope === "subscription_payment" ? "SUB-XXXX-XXXX" : "AUDIT-XXXX-XXXX"})
              </label>
              <label className="flex items-center gap-2 text-sm text-sx-text">
                <input type="radio" checked={!generate} onChange={() => setGenerate(false)} />
                Custom code
              </label>
              {!generate && (
                <Field label="Custom code">
                  <Input value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder="BETA100" className="font-mono uppercase" />
                </Field>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Valid from">
                <Input type="datetime-local" disabled value="" placeholder="now" />
                <p className="mt-1 text-[11px] text-sx-text-subtle">Starts immediately on create</p>
              </Field>
              <Field label="Expires (optional — leave empty for Never)">
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
              <Field label="Maximum total uses">
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
              <Field label="Maximum uses per customer">
                <Input type="number" min={1} value={maxPerCustomer} onChange={(e) => setMaxPerCustomer(e.target.value)} />
              </Field>
              <Field label="Optional customer restriction (email)">
                <Input type="email" value={allowedEmail} onChange={(e) => setAllowedEmail(e.target.value)} placeholder="customer@example.com" />
              </Field>
              <Field label="Optional internal note">
                <Input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="First beta customer" />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={saving}>{saving ? "Creating…" : "Create Code"}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </form>
      )}

      {redemptionsFor && (
        <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-sx-sans text-lg font-semibold text-sx-text">Redemptions — {redemptionsFor.code}</h2>
            <Button type="button" variant="secondary" onClick={() => setRedemptionsFor(null)}>Close</Button>
          </div>
          {redemptionsFor.rows.length === 0 ? (
            <EmptyState title="No redemptions yet" subtitle="This code has not been used." />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-sx-text-subtle">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Activated</th>
                    <th className="py-2 pr-3">Discount</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2">Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptionsFor.rows.map((r) => (
                    <tr key={r.id} className="border-t border-sx-border text-sx-text">
                      <td className="py-2 pr-3">{r.customer_email}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.subscription_id ? `subscription ${r.subscription_id}` : `audit ${r.audit_order_id}`}
                      </td>
                      <td className="py-2 pr-3">₹{(r.discount_cents / 100).toFixed(0)}</td>
                      <td className="py-2 pr-3">₹{(r.amount_due_cents / 100).toFixed(0)}</td>
                      <td className="py-2">{formatWhen(r.redeemed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-sx-text-subtle">Redemption history cannot be deleted. Disable the code to stop new uses.</p>
        </section>
      )}

      <section className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
        <h2 className="font-sx-sans text-lg font-semibold text-sx-text">All codes</h2>
        {loading ? (
          <p className="mt-4 text-sm text-sx-text-muted">Loading…</p>
        ) : codes.length === 0 ? (
          <EmptyState title="No Go Free codes" subtitle="Create a code for beta testers, demos, or support recovery." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-sx-text-subtle">
                <tr>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Uses / Limit</th>
                  <th className="py-2 pr-3">Starts</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-sx-border align-top text-sx-text">
                    <td className="py-3 pr-3 font-mono text-xs font-semibold">{c.code_display}</td>
                    <td className="py-3 pr-3">{c.productLabel}</td>
                    <td className="py-3 pr-3">
                      <StatusChip state={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Disabled"}</StatusChip>
                    </td>
                    <td className="py-3 pr-3">{c.redemptionCount} / {c.max_redemptions ?? "∞"}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(c.valid_from)}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(c.expires_at)}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{formatWhen(c.created_at)}</td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                        <Button type="button" variant="secondary" size="sm" onClick={() => copyCode(c.code_display)}>Copy</Button>
                        {c.is_active ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => setActive(c.id, false)}>Disable</Button>
                        ) : (
                          <Button type="button" variant="secondary" size="sm" onClick={() => setActive(c.id, true)}>Enable</Button>
                        )}
                        <Button type="button" variant="secondary" size="sm" onClick={() => viewRedemptions(c)}>View redemptions</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
