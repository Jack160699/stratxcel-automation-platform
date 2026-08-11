# Revenue Department Architecture

**Status:** Foundation (Sales + CRM + WhatsApp + Conversion workforce ops)  
**Package:** `@stratxcel/revenue-ops`  
**Baseline:** reuses existing `@stratxcel/leads-and-crm` + `@stratxcel/whatsapp` — **no second CRM**.

## Product lifecycle

```
LEAD → CAPTURE → QUALIFY → RESPOND → FOLLOW-UP → APPOINTMENT/OPPORTUNITY → PROPOSAL → CONVERSION → MEASUREMENT
```

| Department | Responsibility |
|------------|----------------|
| **sales** | Qualification, objections, proposal strategy, pipeline analysis, sales follow-up (advisory; no deceptive persuasion) |
| **crm** | Lead intelligence overlay, lifecycle workflow contracts, structured follow-up plans |
| **whatsapp** | Convert plans → message **drafts/sequences** under consent; never autonomous production send |
| **conversion** | Funnel diagnosis + conversion plan from **real events only** |

## Hard invariants

1. **Single CRM** — `crm_leads` remains source of truth. Lifecycle labels overlay existing `LeadStatus`.
2. **Canonical capability registry is not edited.** Revenue requests existing keys only.
3. **Drafting ≠ sending.** Hermes text has zero authorization weight.
4. **No production mutations** in this workstream.
5. **Tenant isolation** — no cross-tenant access; no owner-global fallback.
6. **Consent fail-closed** — opt-out blocks sequences; provenance recorded.
7. **Social is optional** — slow response / weak follow-up routes to `crm_whatsapp_conversion` without Social.

## Key APIs

- `buildLeadIntelligence` / `qualifyLead` → `LeadQualificationArtifact`
- `diagnoseResponseTime` / `isOverdueFollowUp`
- `buildCrmFollowUpPlan` → `crm_followup_plan`
- `buildWhatsAppFollowUpSequence` → drafts with `sendAuthorized: false`
- `authorizeRevenueMutation` / `gateCrmWrite` / `gateWhatsAppSend`
- `diagnoseConversion` / `buildConversionPlan`
- `evaluateHumanHandoff`
- `emitRevenueEvent` (`lead_created`, `first_response`, `qualified`, `meeting_booked`, `proposal_sent`, `won`, `lost`, `followup_completed`)
- `buildRevenueAuditIntelligence`
- `runRevenueWorkflow` / `toBusinessGrowthSignals`

## WhatsApp worker / dashboard

- `SEND_READY` remains false (dashboard composer gate) — unchanged.
- AWS WhatsApp worker auto-reply path unaffected.

## Tests

```bash
npm run test:revenue-ops
```
