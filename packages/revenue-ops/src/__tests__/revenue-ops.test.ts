// Run with: node --experimental-strip-types packages/revenue-ops/src/__tests__/revenue-ops.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMissionBudget } from "../../../workforce-core/src/budgets/hierarchy.ts";
import { snapshotFromContract } from "../../../workforce-core/src/planning/allocation.ts";
import { planBusinessGrowth } from "../../../workforce-core/src/planning/thirty-day-planner.ts";
import type { BusinessGrowthPlannerInput } from "../../../workforce-core/src/planning/types.ts";

import {
  authorizeRevenueMutation,
  buildCrmFollowUpPlan,
  buildLeadIntelligence,
  buildWhatsAppFollowUpSequence,
  canTransition,
  createCollectingRevenueEventEmitter,
  CRM_WORKFLOW_CONTRACTS,
  diagnoseConversion,
  diagnoseResponseTime,
  emitRevenueEvent,
  evaluateHumanHandoff,
  filterLeadsForTenant,
  gateCrmWrite,
  gateWhatsAppSend,
  isDraftOnly,
  isOverdueFollowUp,
  qualifyLead,
  REVENUE_CAPABILITY_REQUIREMENTS,
  revenueRequiresSocial,
  runRevenueWorkflow,
  runSalesSpecialist,
  toBusinessGrowthSignals,
  assertConversationTenant,
  assertSameTenant,
} from "../index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    tenant_id: "tenant-a",
    source: "whatsapp" as const,
    contact_name: "Asha",
    contact_phone: "+919876543210",
    contact_email: null as string | null,
    status: "NEW" as const,
    metadata: {} as Record<string, unknown>,
    tags: [] as string[],
    assigned_to: null as string | null,
    last_interaction_at: null as string | null,
    next_follow_up_at: null as string | null,
    notes: null as string | null,
    ...overrides,
  };
}

function plannerBase(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-a",
    missionId: "mission-rev-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Revenue Co", industry: "services" },
    productsServices: ["Consulting"],
    targetAudience: "local buyers",
    geography: "Raipur",
    positioning: "Trusted local expert",
    connectedChannels: ["Instagram"],
    businessGoals: ["Convert more inquiries"],
    previousPerformance: [],
    existingResearchEvidence: ["ev-rev-1"],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "UNKNOWN",
      packageComposition: [],
      relevantEntitlements: { whatsapp_contacts: 500 },
    }),
    budgetEnvelope: createMissionBudget(50000),
    ...overrides,
  };
}

function run() {
  const responseDiag = diagnoseResponseTime({
    tenantId: "tenant-a",
    nowIso: "2026-08-11T12:00:00.000Z",
    leads: Array.from({ length: 120 }, (_, i) => ({
      leadId: `l-${i}`,
      createdAtIso: "2026-08-10T00:00:00.000Z",
      firstOutboundAtIso: i < 40 ? "2026-08-10T20:00:00.000Z" : null,
      status: i < 40 ? ("CONTACTED" as const) : ("NEW" as const),
      nextFollowUpAtIso: i >= 100 ? "2026-08-10T06:00:00.000Z" : null,
      hasPendingInbound: i >= 40,
    })),
  });
  assert.ok(responseDiag.newLeadsWaiting >= 80);
  assert.equal(responseDiag.fabricated, false);
  assert.ok(responseDiag.medianResponseTimeHours !== null);
  assert.ok((responseDiag.medianResponseTimeHours ?? 0) >= 18);

  const signals = toBusinessGrowthSignals(responseDiag);
  const growth = planBusinessGrowth(
    plannerBase({
      entryMode: "EXISTING_BUSINESS",
      businessSignals: {
        hasWebsite: true,
        websiteTrafficStrength: "high",
        socialPresenceStrength: "high",
        hasAds: true,
        monthlyInquiries: signals.monthlyInquiries ?? 120,
        medianResponseTimeHours: signals.medianResponseTimeHours,
        crmFollowUpStrength: signals.crmFollowUpStrength ?? "weak",
        postContactConversionStrength: "moderate",
        signalEvidenceIds: signals.signalEvidenceIds.length ? signals.signalEvidenceIds : ["ev-rev-1"],
      },
    }),
  );
  assert.ok(growth.bottlenecks[0]?.code === "SLOW_LEAD_RESPONSE" || growth.bottlenecks[0]?.code === "WEAK_FOLLOW_UP");
  const depts = new Set(growth.workforcePlan.departmentStages.map((s) => s.department));
  assert.ok(depts.has("crm") || depts.has("whatsapp"));
  assert.ok(!depts.has("media"), "Revenue bottleneck must not require Social/media stages");
  assert.equal(growth.socialPlan, undefined);
  assert.equal(revenueRequiresSocial(), false);

  const intelSparse = buildLeadIntelligence({ lead: lead({ contact_name: null, metadata: {} }) });
  assert.equal(intelSparse.intent.status, "unknown");
  assert.equal(intelSparse.intent.value, null);
  const qual = qualifyLead({ intelligence: intelSparse });
  assert.equal(qual.decision, "insufficient_evidence");
  assert.deepEqual(qual.inventedFacts, []);
  assert.ok(qual.unknownFields.includes("intent"));
  assert.ok(qual.unknownFields.includes("budget"));

  const intelRich = buildLeadIntelligence({
    lead: lead({
      status: "CONTACTED",
      metadata: { intent: "need website redesign", service_interest: "Consulting", geography: "Raipur" },
    }),
  });
  const qualPass = qualifyLead({
    intelligence: intelRich,
    businessContext: { offeredServices: ["Consulting"], servedGeographies: ["Raipur"] },
  });
  assert.equal(qualPass.decision, "qualified");
  assert.deepEqual(qualPass.inventedFacts, []);

  const plan = buildCrmFollowUpPlan({ intelligence: intelSparse, qualification: qual });
  assert.equal(plan.artifactClass, "crm_followup_plan");
  assert.ok(plan.steps.length > 0);

  const sequence = buildWhatsAppFollowUpSequence({ intelligence: intelSparse, plan });
  assert.equal(sequence.sendAuthorized, false);
  assert.ok(isDraftOnly(sequence));
  assert.ok(sequence.drafts.every((d) => d.sendAuthorized === false && d.status === "draft"));
  const blockedSend = gateWhatsAppSend({
    tenantId: "tenant-a",
    leadTenantId: "tenant-a",
    hermesProposedText: "Hello, we can send this now!",
  });
  assert.equal(blockedSend.allowed, false);
  assert.equal(blockedSend.draftingAllowed, true);
  const approvedSend = gateWhatsAppSend({
    tenantId: "tenant-a",
    leadTenantId: "tenant-a",
    approvalStatus: "APPROVED",
    standingAuthorization: true,
    isHumanInitiated: true,
  });
  assert.equal(approvedSend.allowed, true);

  const optedIntel = buildLeadIntelligence({
    lead: lead(),
    consent: { optedIn: false, optedOut: true, provenance: "customer sent STOP", evidenceIds: ["consent:1"] },
  });
  assert.equal(optedIntel.consent.provenance.value, "customer sent STOP");
  const optedPlan = buildCrmFollowUpPlan({ intelligence: optedIntel });
  assert.equal(optedPlan.steps.length, 0);
  const optedSeq = buildWhatsAppFollowUpSequence({ intelligence: optedIntel, plan: optedPlan });
  assert.equal(optedSeq.blocked, true);
  assert.equal(optedSeq.blockReason, "opt_out");
  assert.equal(optedSeq.optOutHonored, true);
  const optOutSend = authorizeRevenueMutation({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    kind: "whatsapp.send",
    optedOut: true,
    approvalStatus: "APPROVED",
    standingAuthorization: true,
  });
  assert.equal(optOutSend.allowed, false);

  assert.throws(() => assertSameTenant("tenant-a", "tenant-b", "lead"), /cross_tenant_rejected/);
  assert.equal(filterLeadsForTenant("tenant-a", [lead({ id: "1" }), lead({ id: "2", tenant_id: "tenant-b" })]).length, 1);
  assert.throws(
    () => assertConversationTenant({ tenantId: "tenant-a", conversationTenantId: "tenant-b", leadTenantId: "tenant-a" }),
    /cross_tenant_rejected:conversation/,
  );
  assert.throws(
    () => runRevenueWorkflow({ tenantId: "tenant-a", leads: [lead({ tenant_id: "tenant-b" })], timingSamples: [] }),
    /cross_tenant_rejected/,
  );

  assert.equal(gateCrmWrite({ tenantId: "tenant-a", leadTenantId: "tenant-a" }).allowed, false);
  assert.equal(gateCrmWrite({ tenantId: "tenant-a", leadTenantId: "tenant-a", approvalStatus: "APPROVED" }).allowed, true);
  assert.equal(gateCrmWrite({ tenantId: "tenant-a", leadTenantId: "tenant-b", approvalStatus: "APPROVED" }).reason, "tenant_mismatch");

  const handoff = evaluateHumanHandoff({
    intelligence: intelSparse,
    latestCustomerMessage: "I want to talk to a human about a refund dispute",
    highValue: true,
  });
  assert.equal(handoff.shouldEscalate, true);
  assert.ok(handoff.triggers.includes("customer_requests_human"));
  assert.equal(handoff.automationMode, "handoff");

  assert.equal(isOverdueFollowUp("2026-08-10T00:00:00.000Z", "2026-08-11T00:00:00.000Z"), true);
  assert.ok(responseDiag.overdueFollowUps >= 20);

  const emitter = createCollectingRevenueEventEmitter();
  for (const name of ["lead_created", "lead_created", "lead_created"] as const) {
    emitRevenueEvent(emitter, { name, tenantId: "tenant-a", leadId: `x-${name}-${emitter.events.length}` });
  }
  emitRevenueEvent(emitter, { name: "first_response", tenantId: "tenant-a", leadId: "l1" });
  emitRevenueEvent(emitter, { name: "qualified", tenantId: "tenant-a", leadId: "l1" });
  emitRevenueEvent(emitter, { name: "meeting_booked", tenantId: "tenant-a", leadId: "l1" });
  emitRevenueEvent(emitter, { name: "proposal_sent", tenantId: "tenant-a", leadId: "l1" });
  emitRevenueEvent(emitter, { name: "won", tenantId: "tenant-a", leadId: "l1" });
  emitRevenueEvent(emitter, { name: "lost", tenantId: "tenant-a", leadId: "l2" });
  emitRevenueEvent(emitter, { name: "lead_created", tenantId: "tenant-b", leadId: "x1" });

  const conversion = diagnoseConversion({ tenantId: "tenant-a", events: emitter.events });
  assert.equal(conversion.funnel.find((f) => f.stage === "inquiry_capture")?.eventCount, 3);
  assert.ok(conversion.primaryLeak !== null);
  assert.ok(diagnoseConversion({ tenantId: "tenant-a", events: [] }).unknownAreas.includes("inquiry_capture"));

  const workflow = runRevenueWorkflow({
    tenantId: "tenant-a",
    nowIso: "2026-08-11T12:00:00.000Z",
    leads: [lead({ id: "lead-1", metadata: { intent: "website", service_interest: "Consulting", geography: "Raipur" } })],
    timingSamples: [
      {
        leadId: "lead-1",
        createdAtIso: "2026-08-10T00:00:00.000Z",
        firstOutboundAtIso: null,
        status: "NEW",
        nextFollowUpAtIso: "2026-08-10T06:00:00.000Z",
      },
    ],
    events: emitter.events,
    consentByLeadId: { "lead-1": { optedIn: true, optedOut: false, provenance: "staff recorded verbal consent" } },
    businessContext: { offeredServices: ["Consulting"], servedGeographies: ["Raipur"] },
  });
  assert.equal(workflow.workflowFocus, "crm_whatsapp_conversion");
  assert.equal(workflow.requiresSocial, false);
  assert.ok(workflow.followUpPlans[0]!.steps.length > 0);
  assert.equal(workflow.whatsappSequences[0]!.sendAuthorized, false);
  assert.deepEqual(workflow.productionMutations, []);
  assert.ok(REVENUE_CAPABILITY_REQUIREMENTS.departments.includes("sales"));

  assert.ok(CRM_WORKFLOW_CONTRACTS.some((c) => c.mapsToLeadStatus === "NEW"));
  assert.ok(canTransition("new_lead", "contacted"));
  assert.equal(runSalesSpecialist({ role: "objection_handling", intelligence: intelSparse, objections: ["price"] }).deceptivePersuasion, false);

  const sendReady = readFileSync(join(repoRoot, "components/crm/send-readiness.ts"), "utf8");
  assert.match(sendReady, /SEND_READY\s*=\s*false/);
  const worker = readFileSync(join(repoRoot, "apps/whatsapp-worker/src/processor.ts"), "utf8");
  assert.match(worker, /maybeSendAutomaticReply/);
  const revenueIndex = readFileSync(join(repoRoot, "packages/revenue-ops/src/index.ts"), "utf8");
  assert.doesNotMatch(revenueIndex, /whatsapp-worker|sendOutboundWhatsAppMessage/);
  assert.ok(readFileSync(join(repoRoot, "packages/workforce-core/src/capabilities/registry.ts"), "utf8").includes("crm.followup_plan"));

  console.log("revenue-ops tests: ok");
}

run();
