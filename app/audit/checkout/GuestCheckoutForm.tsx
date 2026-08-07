"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * The entire pre-payment form for a signed-out visitor: one required email
 * (to deliver/claim the Audit) and an optional GST-invoice block. No
 * business details, no password, no workspace name — that's what the
 * approved funnel asks for, and asking for more here is exactly the
 * friction the funnel exists to remove.
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    trackFunnel("audit_checkout_started", { surface: "audit_checkout_guest" });
    try {
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
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Get your ₹999 Audit</h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Just your email to send the receipt and secure your access — no account needed yet.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
        {error && <ErrorState message={error} />}

        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.in" />
        </Field>

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
          {submitting ? "Taking you to secure checkout…" : "Pay ₹999 with Razorpay →"}
        </Button>
        <p className="text-center text-[11px] text-sx-text-subtle">
          Already have a Stratxcel account?{" "}
          <a href="/login?next=/audit/checkout" className="font-semibold text-sx-accent hover:underline">
            Sign in
          </a>{" "}
          to skip this step.
        </p>
      </form>
    </div>
  );
}
