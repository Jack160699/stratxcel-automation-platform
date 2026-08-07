"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * Calls the checkout API exactly once and hands the browser to Razorpay's
 * hosted payment page — a real external redirect (window.location, not
 * router.push), since short_url lives on razorpay.com's domain, not ours.
 */
export function CheckoutRedirect() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      trackFunnel("audit_checkout_started", { surface: "audit_checkout" });
      try {
        const res = await fetch("/api/platform/audit/checkout", { method: "POST" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.paymentUrl) {
          setError(body.error ?? "Could not start checkout. Please try again.");
          return;
        }
        window.location.href = body.paymentUrl;
      } catch {
        if (!cancelled) setError("Network error starting checkout. Please try again.");
      }
    }
    start();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-sx-sans text-sm text-sx-text-muted">{error}</p>
        <div className="flex gap-3">
          <Link href="/audit" className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
            Back to Audit
          </Link>
          <Link href="/contact?intent=consultation" className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
            Request a consultation
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
      <p className="font-sx-sans text-sm text-sx-text-muted">Taking you to secure checkout…</p>
    </div>
  );
}
