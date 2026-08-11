import type { WorkforceEventEmitter, WorkforceEventPayload } from "../events/emit.ts";

export type IntelligenceEventName =
  | "intelligence.research.started"
  | "intelligence.research.completed"
  | "intelligence.evidence.reviewed"
  | "intelligence.diagnosis.completed"
  | "intelligence.bottleneck.identified"
  | "intelligence.strategy.completed"
  | "intelligence.recommendation.created"
  | "intelligence.audit.completed";

export interface IntelligenceEvent {
  name: IntelligenceEventName;
  atIso: string;
  payload: WorkforceEventPayload & { data?: Record<string, unknown> };
}

const collected: IntelligenceEvent[] = [];

export function createIntelligenceEventCollector(): { events: IntelligenceEvent[]; emitIntelligenceEvent: typeof emitIntelligenceEvent } {
  const events: IntelligenceEvent[] = [];
  return { events, emitIntelligenceEvent: (event, emitter) => { events.push(event); return emitIntelligenceEvent(event, emitter); } };
}

export function emitIntelligenceEvent(event: IntelligenceEvent, emitter?: WorkforceEventEmitter): IntelligenceEvent {
  collected.push(event);
  emitter?.emit({ name: event.name as import("../events/emit.ts").WorkforceEventName, atIso: event.atIso, payload: event.payload });
  return event;
}

export function drainIntelligenceEvents(): IntelligenceEvent[] {
  return collected.splice(0, collected.length);
}
