import type {
  ConversionDiagnosis,
  ConversionFunnelObservation,
  ConversionFunnelStage,
  ConversionPlan,
  KnowledgeClaimStatus,
  RevenueAnalyticsEvent,
  RevenueAnalyticsEventName,
} from "./types.ts";

const FUNNEL_ORDER: readonly ConversionFunnelStage[] = [
  "inquiry_capture",
  "qualification",
  "response",
  "appointment_booking",
  "proposal",
  "close",
  "objection",
  "abandonment",
];

const EVENT_TO_STAGE: Partial<Record<RevenueAnalyticsEventName, ConversionFunnelStage>> = {
  lead_created: "inquiry_capture",
  qualified: "qualification",
  first_response: "response",
  meeting_booked: "appointment_booking",
  proposal_sent: "proposal",
  won: "close",
  lost: "abandonment",
  followup_completed: "response",
};

/** Derive conversion funnel solely from real analytics events. */
export function diagnoseConversion(input: {
  tenantId: string;
  events: readonly RevenueAnalyticsEvent[];
  objectionTexts?: readonly string[];
  nowIso?: string;
}): ConversionDiagnosis {
  const byStage = new Map<ConversionFunnelStage, { count: number; evidence: string[] }>();
  for (const stage of FUNNEL_ORDER) byStage.set(stage, { count: 0, evidence: [] });

  for (const event of input.events) {
    if (event.tenantId !== input.tenantId) continue;
    const stage = EVENT_TO_STAGE[event.name];
    if (!stage) continue;
    const bucket = byStage.get(stage)!;
    bucket.count += 1;
    bucket.evidence.push(`event:${event.name}:${event.leadId}`);
  }

  const objections = (input.objectionTexts ?? []).filter((t) => t.trim().length > 0);
  if (objections.length) {
    const bucket = byStage.get("objection")!;
    bucket.count = objections.length;
    bucket.evidence.push(...objections.map((_, i) => `objection:${i}`));
  }

  const funnel: ConversionFunnelObservation[] = FUNNEL_ORDER.map((stage) => {
    const bucket = byStage.get(stage)!;
    const status: KnowledgeClaimStatus = bucket.count > 0 ? "KNOWN" : "UNKNOWN";
    return { stage, eventCount: bucket.count, evidenceIds: bucket.evidence, status };
  });

  let primaryLeak: ConversionFunnelStage | null = null;
  let worstDrop = 0;
  const measurable = funnel.filter((f) => f.stage !== "objection" && f.stage !== "abandonment");
  for (let i = 0; i < measurable.length - 1; i++) {
    const a = measurable[i]!;
    const b = measurable[i + 1]!;
    if (a.status === "UNKNOWN" || b.status === "UNKNOWN") continue;
    const drop = a.eventCount - b.eventCount;
    if (drop > worstDrop) {
      worstDrop = drop;
      primaryLeak = b.stage;
    }
  }

  const unknownAreas = funnel.filter((f) => f.status === "UNKNOWN").map((f) => f.stage);
  const lostCount = funnel.find((f) => f.stage === "abandonment")?.eventCount ?? 0;

  return {
    tenantId: input.tenantId,
    funnel,
    primaryLeak,
    objectionsObserved: objections,
    abandonmentSignals: lostCount ? [`lost_events:${lostCount}`] : [],
    unknownAreas,
    generatedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

export function buildConversionPlan(input: {
  diagnosis: ConversionDiagnosis;
  diagnosisId?: string;
  nowIso?: string;
}): ConversionPlan {
  const actions: ConversionPlan["actions"] = [];
  const leak = input.diagnosis.primaryLeak;

  if (leak === "response" || input.diagnosis.funnel.find((f) => f.stage === "response")?.status === "UNKNOWN") {
    actions.push({
      actionId: "conv_response_sla",
      stage: "response",
      objective: "Tighten first-response SLA via CRM + WhatsApp follow-up plan",
      ownerDepartment: "crm",
      requiresHuman: false,
    });
  }
  if (leak === "qualification") {
    actions.push({
      actionId: "conv_qualify",
      stage: "qualification",
      objective: "Run evidence-based qualification; escalate unclear intent to human",
      ownerDepartment: "sales",
      requiresHuman: true,
    });
  }
  if (leak === "appointment_booking") {
    actions.push({
      actionId: "conv_appt",
      stage: "appointment_booking",
      objective: "Offer appointment booking with human confirmation for high-value leads",
      ownerDepartment: "sales",
      requiresHuman: false,
    });
  }
  if (leak === "proposal") {
    actions.push({
      actionId: "conv_proposal",
      stage: "proposal",
      objective: "Improve proposal clarity; no deceptive urgency",
      ownerDepartment: "sales",
      requiresHuman: true,
    });
  }
  if (leak === "close" || leak === "abandonment") {
    actions.push({
      actionId: "conv_close",
      stage: leak,
      objective: "Review lost reasons from real events; human-led recovery where appropriate",
      ownerDepartment: "conversion",
      requiresHuman: true,
    });
  }
  if (input.diagnosis.objectionsObserved.length) {
    actions.push({
      actionId: "conv_objections",
      stage: "objection",
      objective: "Address observed objections honestly — no fabricated social proof",
      ownerDepartment: "sales",
      requiresHuman: true,
    });
  }
  if (!actions.length) {
    actions.push({
      actionId: "conv_measure",
      stage: "inquiry_capture",
      objective: "Instrument funnel events before optimizing — insufficient conversion evidence",
      ownerDepartment: "conversion",
      requiresHuman: false,
    });
  }

  return {
    tenantId: input.diagnosis.tenantId,
    diagnosisId: input.diagnosisId ?? `diag_${input.diagnosis.generatedAtIso}`,
    actions,
    doNotAutomate: ["deceptive_persuasion", "invented_social_proof", "fake_scarcity", "unauthorized_whatsapp_send"],
    generatedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}
