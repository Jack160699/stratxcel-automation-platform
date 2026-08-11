import type { RevenueAnalyticsEvent, RevenueAnalyticsEventName } from "./types.ts";

export interface RevenueEventEmitter {
  emit(event: RevenueAnalyticsEvent): void | Promise<void>;
}

export function createCollectingRevenueEventEmitter(): RevenueEventEmitter & { events: RevenueAnalyticsEvent[] } {
  const events: RevenueAnalyticsEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}

export function emitRevenueEvent(
  emitter: RevenueEventEmitter,
  input: {
    name: RevenueAnalyticsEventName;
    tenantId: string;
    leadId: string;
    missionId?: string;
    atIso?: string;
    evidenceIds?: readonly string[];
    data?: Record<string, unknown>;
  },
): RevenueAnalyticsEvent {
  const event: RevenueAnalyticsEvent = {
    name: input.name,
    atIso: input.atIso ?? new Date().toISOString(),
    tenantId: input.tenantId,
    leadId: input.leadId,
    missionId: input.missionId,
    evidenceIds: input.evidenceIds,
    data: input.data,
  };
  void emitter.emit(event);
  return event;
}

export const REVENUE_ANALYTICS_EVENT_NAMES = [
  "lead_created",
  "first_response",
  "qualified",
  "meeting_booked",
  "proposal_sent",
  "won",
  "lost",
  "followup_completed",
] as const satisfies readonly RevenueAnalyticsEventName[];
