import type { HumanHandoffDecision, HumanHandoffTrigger, LeadIntelligence } from "./types.ts";

const HUMAN_REQUEST = /\b(talk|speak|connect) (to|with) (a |an )?(human|person|agent|someone|representative)\b/i;
const COMPLAINT = /\b(complain|complaint|unacceptable|terrible|scam|fraud|lawyer|legal action)\b/i;
const LEGAL_PAYMENT = /\b(refund|charged|overcharg|invoice|billing|payment (failed|dispute)|cancel (my )?subscription|legal)\b/i;
const SENSITIVE = /\b(suicide|self[- ]harm|abuse|assault|minor|child)\b/i;

export interface HandoffEvaluationInput {
  intelligence: LeadIntelligence;
  latestCustomerMessage?: string | null;
  highValue?: boolean;
  repeatedAutomationFailures?: number;
  unclearIntent?: boolean;
}

export function evaluateHumanHandoff(input: HandoffEvaluationInput): HumanHandoffDecision {
  const triggers: HumanHandoffTrigger[] = [];
  const body = (input.latestCustomerMessage ?? "").trim();

  if (input.highValue === true) triggers.push("high_value_lead");
  if (input.unclearIntent === true) triggers.push("unclear_customer_intent");
  if (body && HUMAN_REQUEST.test(body)) triggers.push("customer_requests_human");
  if (body && COMPLAINT.test(body)) triggers.push("complaint");
  if (body && LEGAL_PAYMENT.test(body)) triggers.push("legal_or_payment_dispute");
  if ((input.repeatedAutomationFailures ?? 0) >= 2) triggers.push("repeated_automation_failure");
  if (body && SENSITIVE.test(body)) triggers.push("sensitive_situation");

  if (!triggers.length) {
    return { shouldEscalate: false, triggers: [], reason: null, automationMode: "automated" };
  }

  return {
    shouldEscalate: true,
    triggers,
    reason: triggers.join(","),
    automationMode: "handoff",
  };
}
