export type WorkforceEventName =
  | "workforce.plan.created"
  | "workforce.plan.validated"
  | "workforce.stage.ready"
  | "workforce.stage.started"
  | "workforce.stage.completed"
  | "workforce.stage.failed"
  | "workforce.review.completed"
  | "workforce.revision.requested"
  | "workforce.plan.revised"
  | "workforce.handoff.created"
  | "workforce.capability.blocked"
  | "intelligence.research.started"
  | "intelligence.research.completed"
  | "intelligence.evidence.reviewed"
  | "intelligence.diagnosis.completed"
  | "intelligence.bottleneck.identified"
  | "intelligence.strategy.completed"
  | "intelligence.recommendation.created"
  | "intelligence.audit.completed"
  | "workforce.metric.observed"
  | "workforce.anomaly.detected"
  | "workforce.optimization.recommended"
  | "workforce.weekly_review.created"
  | "workforce.monthly_review.created"
  | "workforce.learning.applied";

export interface WorkforceEventPayload {
  tenantId: string;
  missionId: string;
  planId?: string;
  stageId?: string;
  department?: string;
  role?: string;
  correlationId?: string;
  data?: Record<string, unknown>;
}

export interface WorkforceEvent {
  name: WorkforceEventName;
  atIso: string;
  payload: WorkforceEventPayload;
}

export interface WorkforceEventEmitter {
  emit(event: WorkforceEvent): void | Promise<void>;
}

export function createNoopWorkforceEventEmitter(): WorkforceEventEmitter {
  return { emit() {} };
}

export function createCollectingWorkforceEventEmitter(): WorkforceEventEmitter & { events: WorkforceEvent[] } {
  const events: WorkforceEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}
