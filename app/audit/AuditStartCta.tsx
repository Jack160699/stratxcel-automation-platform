"use client";

import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * Direct entry point into the free Business Growth Audit. Routes to
 * /app/audit, which is the existing canonical gate: it resolves the
 * visitor's session and sends them to sign-in, the canonical onboarding
 * wizard (Welcome -> Business -> Your Goals -> Your Brand -> Review &
 * Launch), or the audit report itself — whichever applies. No separate
 * onboarding system is created here.
 */
export function AuditStartCta({ className, label = "Start My Free Audit →" }: { className?: string; label?: string }) {
  return (
    <Link
      href="/app/audit"
      onClick={() => trackFunnel("start_audit", { surface: "public_audit_hero", plan: "audit" })}
      className={
        className ??
        "inline-flex min-h-12 w-full items-center justify-center rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
      }
    >
      {label}
    </Link>
  );
}
