import assert from "node:assert/strict";
import { APPROVAL_REQUIRED_ACTIONS, buildSafeHandoffContext, classifyEscalation, CRM_PIPELINE_STAGES, CUSTOMER_MESSAGE_TEMPLATES, CUSTOMER_OPERATIONS_CONTACTS, CUSTOMER_OPERATION_STATUS_LABELS, DATA_OPERATION_DEFAULTS, OAUTH_OPERATION_DEFAULTS, ONBOARDING_QUESTIONS, requiresCustomerApproval } from "../index.ts";
assert.deepEqual(CUSTOMER_OPERATIONS_CONTACTS, { support: "support@stratxcel.in", billing: "billing@stratxcel.in", security: "security@stratxcel.in", grievance: "grievance@stratxcel.in" });
for (const label of ["AI is checking", "Needs your approval", "Sent to Human Assist", "Waiting for provider", "Action blocked for safety", "Completed"]) assert.ok(Object.values(CUSTOMER_OPERATION_STATUS_LABELS).includes(label));
const cases = [
  ["I want to talk to a human now", "HUMAN_REQUEST", "HIGH"], ["I am furious, this is unacceptable", "FRUSTRATION", "HIGH"], ["You charged me twice, refund this", "PAYMENT_REFUND", "HIGH"], ["Our account may be hacked", "SECURITY_PRIVACY", "URGENT"], ["My lawyer will send a legal notice", "LEGAL", "URGENT"], ["Please export our data", "DATA_REQUEST", "HIGH"], ["There is a domain ownership dispute", "DOMAIN_DISPUTE", "HIGH"],
] as const;
for (const [message, reason, priority] of cases) { const result = classifyEscalation({ message }); assert.equal(result.escalate, true); assert.equal(result.reason, reason); assert.equal(result.priority, priority); assert.equal(result.clarifyFirst, false); }
assert.equal(classifyEscalation({ message: "It does not work" }).clarifyFirst, true);
assert.equal(classifyEscalation({ message: "Still unclear", attemptedClarification: true }).escalate, true);
assert.equal(classifyEscalation({ message: "Connection failed", providerConnectionFailed: true }).reason, "PROVIDER_FAILURE");
assert.equal(classifyEscalation({ message: "Publish it", action: "social_publish" }).reason, "HIGH_RISK_APPROVAL");
for (const action of APPROVAL_REQUIRED_ACTIONS) assert.equal(requiresCustomerApproval(action), true);
assert.deepEqual(CRM_PIPELINE_STAGES, ["New lead", "Qualified", "Follow-up scheduled", "Appointment booked", "Proposal sent", "Won", "Lost", "Needs human review"]);
assert.equal(ONBOARDING_QUESTIONS.some(q => "options" in q && q.options.includes("I don't know" as never)), true);
const onboardingCopy = JSON.stringify(ONBOARDING_QUESTIONS);
assert.equal(/api key|access token|waba id|phone-number id|webhook url/i.test(onboardingCopy), false);
for (const name of ["whatsappWelcome", "whatsappFallback", "whatsappEscalation", "optOutConfirmation", "supportAcknowledgement", "billingAcknowledgement", "securityAcknowledgement", "grievanceAcknowledgement", "refundAcknowledgement", "providerWait", "approvalRequest", "dataRequestAcknowledgement", "domainTransferAcknowledgement"] as const) assert.ok(CUSTOMER_MESSAGE_TEMPLATES[name].length > 20);
assert.match(OAUTH_OPERATION_DEFAULTS.disconnect, /does not delete historical/);
assert.deepEqual([DATA_OPERATION_DEFAULTS.recoveryWindowDays, DATA_OPERATION_DEFAULTS.deletionTargetDays, DATA_OPERATION_DEFAULTS.backupAgeOutDays], [30, 30, 90]);
const safe = buildSafeHandoffContext({ customerId: "c1", tenantId: "t1", conversationSummary: "Help", redactedError: "token=abc password: xyz" });
assert.equal(safe.redacted_error?.includes("abc"), false); assert.equal(safe.redacted_error?.includes("xyz"), false);
console.log("customer-operations.test.ts: ALL PASS (contacts, statuses, escalation, approvals, onboarding, CRM, templates, OAuth, retention, redaction)");
