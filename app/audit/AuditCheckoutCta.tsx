"use client";

import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * Entry point into payment-first checkout. Always routes through
 * /audit/checkout, which resolves auth (sign in if needed, via the existing
 * ?next= handoff) before ever calling the payment-creation API — a signed-out
 * visitor is never asked to create a full account here, only to authenticate
 * enough to own the payment they're about to make.
 */
export function AuditCheckoutCta() {
  return (
    <Link
      href="/audit/checkout"
      onClick={() => trackFunnel("audit_cta", { surface: "public_audit" })}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
    >
      Pay ₹999 & Start My Audit →
    </Link>
  );
}
