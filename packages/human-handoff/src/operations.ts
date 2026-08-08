export const CUSTOMER_OPERATIONS_CONTACTS = {
  support: "support@stratxcel.in",
  billing: "billing@stratxcel.in",
  security: "security@stratxcel.in",
  grievance: "grievance@stratxcel.in",
} as const;

export type AssistPriority = "URGENT" | "HIGH" | "NORMAL";
export type AssistReason = "HUMAN_REQUEST" | "FRUSTRATION" | "PAYMENT_REFUND" | "SECURITY_PRIVACY" | "LEGAL" | "DATA_REQUEST" | "DOMAIN_DISPUTE" | "PROVIDER_FAILURE" | "HIGH_RISK_APPROVAL" | "UNCLEAR";
export type CustomerOperationStatus = "AI_CHECKING" | "NEEDS_APPROVAL" | "HUMAN_ASSIST" | "WAITING_PROVIDER" | "BLOCKED_SAFETY" | "COMPLETED";
export const CUSTOMER_OPERATION_STATUS_LABELS: Record<CustomerOperationStatus, string> = { AI_CHECKING: "AI is checking", NEEDS_APPROVAL: "Needs your approval", HUMAN_ASSIST: "Sent to Human Assist", WAITING_PROVIDER: "Waiting for provider", BLOCKED_SAFETY: "Action blocked for safety", COMPLETED: "Completed" };

export const APPROVAL_REQUIRED_ACTIONS = ["social_publish", "ads_launch", "ads_material_budget_change", "payment", "refund", "website_production_deploy", "domain_register", "domain_renew", "domain_transfer", "sensitive_customer_message", "account_data_export", "account_data_delete", "irreversible_provider_disconnect", "legal_action", "security_action"] as const;
export type ApprovalRequiredAction = typeof APPROVAL_REQUIRED_ACTIONS[number];
export function requiresCustomerApproval(action: string): action is ApprovalRequiredAction { return APPROVAL_REQUIRED_ACTIONS.includes(action as ApprovalRequiredAction); }

export interface EscalationContext { message: string; attemptedClarification?: boolean; providerConnectionFailed?: boolean; action?: string; route?: string; }
export interface EscalationDecision { escalate: boolean; priority: AssistPriority; reason: AssistReason; clarifyFirst: boolean; contact: string; }
const has = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
export function classifyEscalation(input: EscalationContext): EscalationDecision {
  const text = input.message.toLowerCase();
  const immediate: Array<[AssistReason, AssistPriority, RegExp[], string]> = [
    ["SECURITY_PRIVACY", "URGENT", [/hack|breach|compromis|stolen|unauthori[sz]ed|privacy incident|data leak/], CUSTOMER_OPERATIONS_CONTACTS.security],
    ["LEGAL", "URGENT", [/legal notice|lawyer|court|sue|police|regulator|legal action/], CUSTOMER_OPERATIONS_CONTACTS.grievance],
    ["PAYMENT_REFUND", "HIGH", [/refund|chargeback|charged twice|wrong charge|payment dispute|billing issue/], CUSTOMER_OPERATIONS_CONTACTS.billing],
    ["DATA_REQUEST", "HIGH", [/delete (my|our) (account|data)|data deletion|export (my|our) data|account export/], CUSTOMER_OPERATIONS_CONTACTS.grievance],
    ["DOMAIN_DISPUTE", "HIGH", [/domain (ownership|transfer|dispute)|transfer.*domain|registrant dispute/], CUSTOMER_OPERATIONS_CONTACTS.support],
    ["HUMAN_REQUEST", "HIGH", [/(human|person|agent|manager|support team).*(please|now|talk|speak)|talk to (a )?(human|person|agent)/], CUSTOMER_OPERATIONS_CONTACTS.support],
    ["FRUSTRATION", "HIGH", [/angry|furious|frustrat|unacceptable|terrible|useless|fed up|this is ridiculous/], CUSTOMER_OPERATIONS_CONTACTS.support],
  ];
  for (const [reason, priority, patterns, contact] of immediate) if (has(text, patterns)) return { escalate: true, priority, reason, clarifyFirst: false, contact };
  if (input.providerConnectionFailed) return { escalate: true, priority: "HIGH", reason: "PROVIDER_FAILURE", clarifyFirst: false, contact: CUSTOMER_OPERATIONS_CONTACTS.support };
  if (input.action && requiresCustomerApproval(input.action)) return { escalate: true, priority: "HIGH", reason: "HIGH_RISK_APPROVAL", clarifyFirst: false, contact: CUSTOMER_OPERATIONS_CONTACTS.support };
  if (input.attemptedClarification) return { escalate: true, priority: "NORMAL", reason: "UNCLEAR", clarifyFirst: false, contact: CUSTOMER_OPERATIONS_CONTACTS.support };
  return { escalate: false, priority: "NORMAL", reason: "UNCLEAR", clarifyFirst: true, contact: CUSTOMER_OPERATIONS_CONTACTS.support };
}

export interface SafeHandoffContext { customerId: string; tenantId: string; conversationSummary: string; lastAttemptedAction?: string; route?: string; redactedError?: string; }
export function buildSafeHandoffContext(input: SafeHandoffContext) { return { customer_id: input.customerId, tenant_id: input.tenantId, conversation_summary: input.conversationSummary, last_attempted_action: input.lastAttemptedAction ?? null, route: input.route ?? null, redacted_error: input.redactedError?.replace(/(token|secret|password|api[_ -]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]") ?? null }; }

export const CRM_PIPELINE_STAGES = ["New lead", "Qualified", "Follow-up scheduled", "Appointment booked", "Proposal sent", "Won", "Lost", "Needs human review"] as const;
export const ONBOARDING_QUESTIONS = [
  { key: "business_identity", prompt: "What is your registered or trading business name?", required: true },
  { key: "location", prompt: "Where do you serve customers?", required: true },
  { key: "website", prompt: "Do you already have a website or domain?", options: ["Yes", "No", "I don't know"] },
  { key: "social", prompt: "Which social accounts does your business use?", options: ["Instagram", "Facebook", "LinkedIn", "YouTube", "Other", "I don't know"] },
  { key: "whatsapp", prompt: "Which business number should receive customer enquiries?", options: ["I use WhatsApp Business", "I use regular WhatsApp", "Not yet", "I don't know"] },
  { key: "google_business", prompt: "Do you have a Google Business Profile?", options: ["Yes", "No", "I don't know"] },
  { key: "ads", prompt: "Do you currently advertise with Meta or Google?", options: ["Meta", "Google", "Both", "No", "I don't know"] },
  { key: "brand_assets", prompt: "Upload any logo, photos, menus, brochures, or brand guidelines you already have.", required: false },
  { key: "goals", prompt: "What are the top outcomes you want Stratxcel to improve?", required: true },
  { key: "approvals", prompt: "Who should approve public, paid, or irreversible actions?", options: ["Me", "A team member", "Decide later"] },
] as const;

export const CUSTOMER_MESSAGE_TEMPLATES = {
  whatsappWelcome: "Thanks for contacting {business}. I can help with your enquiry and will involve the team when needed.",
  whatsappFallback: "I’m not fully sure I understood. Could you share one more detail about what you need?",
  whatsappEscalation: "Thanks—that needs a person’s attention. I’ve sent the conversation to Human Assist with the context so you do not need to repeat yourself.",
  optOutConfirmation: "You’re opted out of promotional messages. We may still send essential service messages where permitted.",
  supportAcknowledgement: "We’ve received your support request and sent it to Human Assist. We’ll update you through your provided contact channel.",
  billingAcknowledgement: "We’ve received your billing request. No additional charge or refund action will be taken without verification and approval.",
  securityAcknowledgement: "We’ve received your security report and marked it urgent. If compromise is suspected, revoke affected access first and avoid sharing passwords or tokens.",
  grievanceAcknowledgement: "We’ve recorded your grievance for review and will respond through your provided contact channel.",
  refundAcknowledgement: "We’ve received your refund request. We’ll verify the transaction and explain the outcome before any action.",
  providerWait: "The request is waiting for the provider. Your work is saved; we’ll show the next required step when the provider responds.",
  approvalRequest: "This action can be public, paid, or difficult to reverse. Please review the summary and approve or reject it.",
  dataRequestAcknowledgement: "We’ve received your data export or deletion request. We’ll verify authority, explain what can be exported or retained, and confirm before deletion.",
  domainTransferAcknowledgement: "We’ve received your domain transfer or website export request. We’ll verify ownership and explain any genuine registrar, unpaid, security, or legal restriction.",
} as const;

export const OAUTH_OPERATION_DEFAULTS = { disconnect: "Revoke future access immediately. Disconnecting does not delete historical workspace data.", reconnect: "Reconnect with the provider’s official authorization flow and reuse safe existing workspace setup where possible.", suspectedCompromise: "Revoke first, then reconnect with fresh provider authorization.", historicalData: "Historical imported data remains under the retention policy unless deletion is separately requested." } as const;
export const DATA_OPERATION_DEFAULTS = { activeAccount: "Kept while the service is active.", recoveryWindowDays: 30, deletionTargetDays: 30, backupAgeOutDays: 90, retainedRecords: "Billing, tax, fraud, security, dispute, and legal records are retained as legally required.", exportScope: "Permitted customer data, content, and assets can be exported.", domainOwnership: "The customer owns the client domain; transfer-out has no artificial lock-in.", websiteExport: "Permitted content, design, SEO data, and customer assets are exportable; Stratxcel platform code and internal tools are excluded unless expressly agreed." } as const;
