"use client";

import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * Direct entry point into the Free Instant Business Audit.
 * Routes straight to /app/audit for verified session or onboarding.
 */
export function AuditCheckoutCta() {
  return (
    <Link
      href="/app/audit"
      onClick={() => trackFunnel("audit_cta", { surface: "public_audit" })}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
    >
      Get Your Free Instant Audit →
    </Link>
  );
}
