"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

const LIST_PRICE_LABEL = "₹999";

/**
 * Guest Audit checkout: email + optional GST + optional Go Free code.
 * Amounts and fulfilment are always resolved server-side.
 */
export function GuestCheckoutForm() {
  const [email, setEmail] = useState("");
  const [wantsGstInvoice, setWantsGstInvoice] = useState(false);
  const [gstInvoice, setGstInvoice] = useState({
    legalBusinessName: "",
    gstin: "",
    billingAddress: "",
    state: "",
    pin: "",
  });
  const [promoInput, setPromoInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  const free = Boolean(appliedCode);

  async function applyCode() {
    if (applying) return;
    const code = promoInput.trim();
    if (!code) {
      setError("Enter a Go Free code.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email before applying a code.");
      return;
    }
    setApplying(true);
    setError(null);
    setPromoMessage(null);
    try {
      const res = await fetch("/api/platform/audit/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: code, email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.valid) {
        setAppliedCode(null);
        setError(body.error ?? "This code is invalid.");
        setApplying(false);
        return;
      }
      setAppliedCode(code.trim().toUpperCase());
      setPromoMessage("Code applied");
    } catch {
      setError("Network error validating code. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  function removeCode() {
    setAppliedCode(null);
    setPromoInput("");
    setPromoMessage(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    trackFunnel("audit_checkout_started", {
      surface: "audit_checkout_guest",
    });

    try {
      if (free && appliedCode) {
        const res = await fetch("/api/platform/audit/promo/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promoCode: appliedCode,
            email: email.trim(),
            ...(wantsGstInvoice ? { gstInvoice } : {}),
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          setError(body.error ?? "Could not redeem this code. Please try again.");
          setSubmitting(false);
          return;
        }
        window.location.href = body.accessPath ?? `/audit/access?auditOrderId=${encodeURIComponent(body.auditOrderId)}`;
        return;
      }

      const res = await fetch("/api/platform/audit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), ...(wantsGstInvoice ? { gstInvoice } : {}) }),
      });
      const body = await res.json();
      if (!res.ok || !body.paymentUrl) {
        setError(body.error ?? "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = body.paymentUrl;
    } catch {
      setError("Network error starting checkout. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Business Growth Audit</h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Just your email to send the receipt and secure your access — no account needed yet.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
        {error && <ErrorState message={error} />}

        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-3 text-sm text-sx-text">
          <div className="flex items-center justify-between gap-3">
            <span>Business Growth Audit</span>
            <span className="font-semibold">{LIST_PRICE_LABEL}</span>
          </div>
          {free && (
            <div className="mt-2 flex items-center justify-between gap-3 text-sx-text-muted">
              <span>Go Free code</span>
              <span>-{LIST_PRICE_LABEL}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-sx-border pt-2 font-semibold">
            <span>Total</span>
            <span>{free ? "₹0" : LIST_PRICE_LABEL}</span>
          </div>
          {promoMessage && <p className="mt-2 text-xs text-sx-accent">✓ {promoMessage}</p>}
        </div>

        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.in" />
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-sx-text-muted">Have a Go Free code?</p>
          {free ? (
            <div className="flex items-center justify-between gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-2 text-sm">
              <span className="font-mono font-semibold tracking-wide">{appliedCode}</span>
              <button type="button" className="text-xs font-semibold text-sx-accent hover:underline" onClick={removeCode}>
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Enter code"
                className="font-mono uppercase"
                autoCapitalize="characters"
              />
              <Button type="button" variant="secondary" size="touch" disabled={applying} onClick={applyCode}>
                {applying ? "Checking…" : "Apply"}
              </Button>
            </div>
          )}
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

        <Button type="submit" variant="primary" size="touch" disabled={submitting}>
          {submitting
            ? free
              ? "Starting your free Audit…"
              : "Taking you to secure checkout…"
            : free
              ? "Continue Free"
              : "Pay ₹999 & Start"}
        </Button>
        <p className="text-center text-[11px] text-sx-text-subtle">
          Already have a Stratxcel account?{" "}
          <a href="/login?mode=customer&next=/audit/checkout" className="font-semibold text-sx-accent hover:underline">
            Sign in
          </a>{" "}
          to skip this step.
        </p>
      </form>
    </div>
  );
}
