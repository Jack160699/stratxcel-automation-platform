"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

const LIST_PRICE_LABEL = "₹999";

/**
 * Signed-in Audit checkout with optional Go Free code.
 * Does not auto-redirect to Razorpay so customers can apply a code first.
 */
export function CheckoutRedirect() {
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
    setApplying(true);
    setError(null);
    setPromoMessage(null);
    try {
      const res = await fetch("/api/platform/audit/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: code }),
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

  async function continueCheckout() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    trackFunnel("audit_checkout_started", { surface: "audit_checkout" });

    try {
      if (free && appliedCode) {
        const res = await fetch("/api/platform/audit/promo/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promoCode: appliedCode }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          setError(body.error ?? "Could not redeem this code. Please try again.");
          setSubmitting(false);
          return;
        }
        window.location.href = body.accessPath ?? `/app/audit`;
        return;
      }

      const res = await fetch("/api/platform/audit/checkout", { method: "POST" });
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
        <p className="mt-2 text-sm text-sx-text-muted">Confirm payment or continue free with a Go Free code.</p>
      </div>

      <div className="flex flex-col gap-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Code">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Enter code"
                    className="font-mono uppercase"
                    autoCapitalize="characters"
                  />
                </Field>
              </div>
              <Button type="button" variant="secondary" size="touch" disabled={applying} onClick={applyCode}>
                {applying ? "Checking…" : "Apply"}
              </Button>
            </div>
          )}
        </div>

        <Button type="button" variant="primary" size="touch" disabled={submitting} onClick={continueCheckout}>
          {submitting
            ? free
              ? "Starting your free Audit…"
              : "Taking you to secure checkout…"
            : free
              ? "Continue Free"
              : "Pay ₹999 & Start"}
        </Button>

        <div className="flex justify-center gap-3 text-center">
          <Link href="/audit" className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
            Back to Audit
          </Link>
          <Link href="/contact?intent=consultation" className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
            Request a consultation
          </Link>
        </div>
      </div>
    </div>
  );
}
