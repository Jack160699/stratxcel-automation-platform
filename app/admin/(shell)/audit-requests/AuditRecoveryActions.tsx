"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function AuditRecoveryActions({ runId }: { runId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/platform/audit/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "retry" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error ?? "Recovery could not be queued.");
        return;
      }
      setMessage("Recovery queued.");
      router.refresh();
    } catch {
      setMessage("Network error. No recovery action was applied.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="touch" onClick={retry} disabled={submitting}>
        {submitting ? "Queueing recovery…" : "Retry automatic generation"}
      </Button>
      <span className="text-xs text-sx-text-muted" role="status">{message}</span>
    </div>
  );
}
