/** Canonical AI Runtime contracts — no secrets, no auth headers. */

export type AIProviderId = "google" | "openai";

export type AIModality = "text" | "image" | "video" | "audio" | "realtime";

export type AITaskClass =
  | "ROUTING"
  | "GENERAL_SPECIALIST"
  | "CONTENT"
  | "CONTENT_STRATEGY"
  | "SEO_RESEARCH"
  | "RESEARCH"
  | "STRATEGY"
  | "SALES_CONVERSION"
  | "EXECUTIVE"
  | "PREMIUM_AUDIT"
  | "BRAND_TRUST"
  | "ANALYTICS"
  | "REPORTING"
  | "WEBSITE_ENGINEERING"
  | "CREATIVE_TEXT"
  | "IMAGE"
  | "VIDEO"
  | "VOICE"
  | "TRANSCRIPTION";

export type AIReasoningLevel = "none" | "minimal" | "low" | "medium" | "high";

export type AIQualityDecision = "PASS" | "FAIL" | "SKIP";

export type AIFallbackReason =
  | "http_402"
  | "http_408"
  | "http_429"
  | "http_5xx"
  | "timeout"
  | "network_failure"
  | "model_unavailable"
  | "rate_limit"
  | "provider_unhealthy"
  | "quality_escalation"
  | "budget_soft_prefer_cheap"
  | "none";

export type AIErrorCategory =
  | "TRANSIENT"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "CREDIT"
  | "AUTH_CONFIGURATION"
  | "SAFETY_REFUSAL"
  | "COMPLIANCE"
  | "ENTITLEMENT"
  | "TENANT_ISOLATION"
  | "PERMISSION"
  | "APPROVAL_REQUIRED"
  | "SHADOW"
  | "INVALID_INPUT"
  | "NOT_CONFIGURED"
  | "BUDGET_EXHAUSTED"
  | "INSUFFICIENT_EVIDENCE"
  | "PROVIDER_FAILURE"
  | "INTERNAL_FAILURE";

export type AIBudgetStatus =
  | "ok"
  | "soft_70"
  | "warning_85"
  | "exhausted_100"
  | "unknown";

export type PlanTier = "starter" | "growth" | "business" | "scale" | "custom";

export interface AIModelDefinition {
  id: string;
  catalogKey: string;
  provider: AIProviderId;
  modality: AIModality;
  purpose: string;
  active: boolean;
  deprecated: boolean;
}

export interface AICostMetadata {
  provider: AIProviderId;
  model: string;
  unit: "token" | "image" | "video_second" | "audio_minute";
  inputUsdPerMillion?: number;
  cachedInputUsdPerMillion?: number;
  outputUsdPerMillion?: number;
  imageUnitCostUsd?: number;
  videoSecondCostUsd?: number;
  audioUnitCostUsd?: number;
  verifiedAt: string;
  sourceNote: string;
}

export interface AIRoutingCandidate {
  provider: AIProviderId;
  model: string;
  role: "primary" | "fallback" | "escalation" | "frontier";
  reasoningLevel: AIReasoningLevel;
}

export interface AIRoutingPolicy {
  taskClass: AITaskClass;
  candidates: readonly AIRoutingCandidate[];
  allowWebSearch: boolean;
  allowGoogleSearchGrounding: boolean;
  maxAttempts: number;
  maxQualityEscalations: number;
  notes?: string;
}

export interface AIMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  /** When role=assistant, optional function_call items for Responses API continuation. */
  toolCalls?: AIToolCall[];
}

export interface AIToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIBudgetEnvelope {
  plan: PlanTier;
  monthlyBudgetUsd: number;
  spentUsdThisMonth: number;
  reservedCriticalUsd?: number;
  allowEmergencyMargin?: boolean;
  ownerApprovedOverage?: boolean;
}

export interface AIExecutionRequest {
  tenantId: string;
  missionId?: string | null;
  department?: string | null;
  specialistRole?: string | null;
  taskClass: AITaskClass;
  messages: readonly AIMessage[];
  tools?: readonly AIToolSchema[];
  structuredOutputSchema?: Record<string, unknown>;
  qualityTarget?: number;
  routingPolicyOverride?: AIRoutingPolicy;
  budgetEnvelope?: AIBudgetEnvelope;
  requireWebEvidence?: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  correlationId?: string;
  /** When true, skip provider hop on safety/compliance errors (always enforced). */
  respectSafetyBoundary?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AIToolUsage {
  webSearchCalls?: number;
  webSearchQueries?: number;
  estimatedToolCostUsd?: number;
  /** Conservative accounting label — not an invoice. */
  costEstimateKind?: "upper_bound" | "exact" | "unknown";
}

export interface AIUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  mediaUnits?: number;
  /** Token/media cost + conservative search-tool cost when present. */
  estimatedCostUsd: number;
  toolUsage?: AIToolUsage;
}

export interface AIQualityAssessment {
  score: number;
  decision: AIQualityDecision;
  reasons: readonly string[];
}

/** Provider-neutral web evidence — adapters parse raw provider JSON into this. */
export interface AIWebSource {
  id: string;
  /** Provider-native source identity (when available). */
  providerSourceId?: string;
  url: string;
  title?: string;
  domain?: string;
  provider: AIProviderId;
  searchQueries?: readonly string[];
  /** Character offsets into response text when known. */
  startIndex?: number;
  endIndex?: number;
}

export interface AICitationSupport {
  /** Claim / segment text when provided by the provider. */
  text?: string;
  startIndex?: number;
  endIndex?: number;
  /** Stable source ids in AIWebEvidence.sources. */
  sourceIds: readonly string[];
  /** Backward compatibility; indices into AIWebEvidence.sources. */
  sourceIndices?: readonly number[];
}

export interface AIWebEvidence {
  sources: readonly AIWebSource[];
  citationSupports: readonly AICitationSupport[];
  searchQueries: readonly string[];
  /** Opaque safe attribution metadata only — never render provider HTML blindly. */
  searchAttribution?: {
    hasSearchEntryPoint: boolean;
    renderedContentLength?: number;
  };
}

export interface AIModelAttempt {
  attemptNumber: number;
  provider: AIProviderId;
  model: string;
  role: AIRoutingCandidate["role"];
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  success: boolean;
  errorCategory?: AIErrorCategory;
  fallbackReason?: AIFallbackReason;
  usage?: AIUsage;
  providerRequestId?: string | null;
}

export interface AISelectionReceipt {
  taskClass: AITaskClass;
  department: string | null;
  primaryProvider: AIProviderId;
  primaryModel: string;
  selectedProvider: AIProviderId;
  selectedModel: string;
  fallbackUsed: boolean;
  fallbackReason: AIFallbackReason;
  escalationLevel: number;
  budgetStatus: AIBudgetStatus;
  estimatedCostUsd: number;
}

export interface AIExecutionResult {
  ok: boolean;
  text: string;
  structuredOutput?: unknown;
  toolCalls: AIToolCall[];
  /** Normalized web grounding / citation evidence when the provider returned it. */
  webEvidence?: AIWebEvidence;
  provider: AIProviderId | null;
  model: string | null;
  reasoningLevel: AIReasoningLevel;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  attemptNumber: number;
  fallbackUsed: boolean;
  fallbackReason: AIFallbackReason;
  qualityScore: number | null;
  qualityDecision: AIQualityDecision;
  requestId: string;
  providerRequestId: string | null;
  createdAt: string;
  selection: AISelectionReceipt;
  attempts: readonly AIModelAttempt[];
  errorCategory?: AIErrorCategory;
  userSafeError?: string;
  errorDetailSafe?: string;
}

export interface AIProviderHealth {
  provider: AIProviderId;
  configured: boolean;
  reachable: boolean;
  modelAvailable: boolean;
  circuitOpen: boolean;
  lastCheckedAt: string | null;
  safeErrorCode: string | null;
}

export interface AITextProviderAdapter {
  readonly provider: AIProviderId;
  isConfigured(): boolean;
  complete(args: {
    model: string;
    messages: readonly AIMessage[];
    tools?: readonly AIToolSchema[];
    reasoningLevel: AIReasoningLevel;
    structuredOutputSchema?: Record<string, unknown>;
    enableWebSearch?: boolean;
    enableGoogleSearchGrounding?: boolean;
    timeoutMs: number;
    abortSignal?: AbortSignal;
  }): Promise<{
    text: string;
    structuredOutput?: unknown;
    toolCalls: AIToolCall[];
    usage: AIUsage;
    providerRequestId: string | null;
    safetyRefused?: boolean;
    webEvidence?: AIWebEvidence;
  }>;
  probeReadiness(model?: string): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">>;
}

export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}
