"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackFunnel } from "@/lib/analytics/events";

/**
 * Records the consultation request against the tenant, then hands the
 * customer to /contact to actually write their message. Navigation happens
 * regardless of whether the record succeeded — failing to log an event must
 * never stand between someone and talking to the team.
 */
export function ConsultationLink({
  tenantId,
  href,
  label,
  className,
}: {
  tenantId: string;
  href: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    trackFunnel("consultation_requested", { surface: "app_journey" });
    try {
      await fetch("/api/platform/journey/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
    } catch {
      // Recording is best-effort; the contact form is the real destination.
    }
    router.push(href);
  }

  return (
    <button type="button" onClick={go} disabled={busy} className={className}>
      {label}
    </button>
  );
}
