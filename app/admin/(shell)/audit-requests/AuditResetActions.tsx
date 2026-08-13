"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function AuditResetActions() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resetEligibility() {
    if (!window.confirm("Archive current Audits and allow every existing customer to start one new free Audit? Financial history is kept.")) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/platform/audit/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_eligibility", reason: "product_reset_v1_experience" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error ?? "Reset could not be applied.");
        return;
      }
      setMessage(`Reset complete. ${body.tenantsGranted ?? 0} workspaces granted a fresh Audit.`);
      router.refresh();
    } catch {
      setMessage("Network error. No reset was applied.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="touch" onClick={resetEligibility} disabled={submitting}>
        {submitting ? "Resetting…" : "Reset free Audit eligibility"}
      </Button>
      <span className="text-xs text-sx-text-muted" role="status">{message}</span>
    </div>
  );
}
