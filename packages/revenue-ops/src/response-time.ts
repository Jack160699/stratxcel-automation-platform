import type { LeadStatus, ResponseTimeDiagnosis } from "./types.ts";

export interface LeadTimingSample {
  leadId: string;
  createdAtIso: string;
  firstOutboundAtIso: string | null;
  status: LeadStatus;
  nextFollowUpAtIso: string | null;
  hasPendingInbound?: boolean;
}

function hoursBetween(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return NaN;
  return (endMs - startMs) / (1000 * 60 * 60);
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** True when a scheduled follow-up timestamp is before the reference time. */
export function isOverdueFollowUp(nextFollowUpAtIso: string, nowIso: string): boolean {
  const dueMs = new Date(nextFollowUpAtIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return false;
  return dueMs < nowMs;
}

/** Diagnose response speed from real timing samples only — never fabricates metrics. */
export function diagnoseResponseTime(input: {
  tenantId: string;
  leads: readonly LeadTimingSample[];
  nowIso: string;
}): ResponseTimeDiagnosis {
  const nowIso = input.nowIso;
  const responseHours: number[] = [];
  const evidenceIds: string[] = [];
  let newLeadsWaiting = 0;
  let unansweredLeads = 0;
  let overdueFollowUps = 0;

  for (const sample of input.leads) {
    const hasFirstOutbound = sample.firstOutboundAtIso !== null && sample.firstOutboundAtIso !== undefined;

    if (sample.status === "NEW" && !hasFirstOutbound) {
      newLeadsWaiting += 1;
      evidenceIds.push(`lead:${sample.leadId}:new_waiting`);
    }

    if (sample.hasPendingInbound) {
      unansweredLeads += 1;
      evidenceIds.push(`lead:${sample.leadId}:pending_inbound`);
    }

    if (sample.nextFollowUpAtIso && isOverdueFollowUp(sample.nextFollowUpAtIso, nowIso)) {
      overdueFollowUps += 1;
      evidenceIds.push(`lead:${sample.leadId}:overdue_follow_up`);
    }

    if (hasFirstOutbound) {
      const hours = hoursBetween(sample.createdAtIso, sample.firstOutboundAtIso!);
      if (Number.isFinite(hours) && hours >= 0) {
        responseHours.push(hours);
        evidenceIds.push(`lead:${sample.leadId}:first_response`);
      }
    }
  }

  return {
    tenantId: input.tenantId,
    newLeadsWaiting,
    unansweredLeads,
    overdueFollowUps,
    medianResponseTimeHours: median(responseHours),
    sampleSize: responseHours.length,
    evidenceIds,
    fabricated: false,
    generatedAtIso: nowIso,
  };
}
