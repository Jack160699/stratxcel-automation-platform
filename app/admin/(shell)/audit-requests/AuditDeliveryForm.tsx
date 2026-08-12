"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Input";

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function AuditDeliveryForm({ auditOrderId, tenantId }: { auditOrderId: string; tenantId: string }) {
  const router = useRouter();
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [priorityRisks, setPriorityRisks] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);

  async function deliver() {
    if (!executiveSummary.trim() || lines(priorityRisks).length === 0 || lines(actionPlan).length === 0) {
      setError("Add an executive summary, at least one priority risk, and at least one action step.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/audit/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditOrderId,
          tenantId,
          reportData: {
            executiveSummary,
            strengths: lines(strengths),
            priorityRisks: lines(priorityRisks),
            actionPlan: lines(actionPlan),
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The report could not be delivered.");
        return;
      }
      setDelivered(true);
      router.refresh();
    } catch {
      setError("Network error delivering this report. Nothing was marked complete.");
    } finally {
      setSubmitting(false);
    }
  }

  if (delivered) {
    return <p className="text-sm text-emerald-600" role="status">Report delivered and audit completed.</p>;
  }

  return (
    <div className="grid gap-3 border-t border-sx-border pt-4">
      <Field label="Executive summary">
        <Textarea value={executiveSummary} onChange={(event) => setExecutiveSummary(event.target.value)} className="min-h-28" />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Strengths (one per line)">
          <Textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} />
        </Field>
        <Field label="Priority risks (one per line)">
          <Textarea value={priorityRisks} onChange={(event) => setPriorityRisks(event.target.value)} />
        </Field>
        <Field label="90-day plan (one step per line)">
          <Textarea value={actionPlan} onChange={(event) => setActionPlan(event.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" size="touch" onClick={deliver} disabled={submitting}>
          {submitting ? "Delivering…" : "Deliver report and complete audit"}
        </Button>
      </div>
    </div>
  );
}
