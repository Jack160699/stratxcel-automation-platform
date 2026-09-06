import type { AIReasoningLevel, AIRoutingPolicy, AITaskClass, PlanTier } from "../types.ts";
import { resolveModelId } from "../catalog/models.ts";

function policy(
  taskClass: AITaskClass,
  candidates: AIRoutingPolicy["candidates"],
  extras?: Partial<AIRoutingPolicy>,
): AIRoutingPolicy {
  return {
    taskClass,
    candidates,
    allowWebSearch: false,
    allowGoogleSearchGrounding: false,
    maxAttempts: 2,
    maxQualityEscalations: 2,
    ...extras,
  };
}

/**
 * Remote local AI server is opt-in only: even when LOCAL_AI_API_URL/KEY are
 * configured, it is never selected by task-class routing unless this is
 * explicitly set. This keeps adding the provider from silently changing any
 * existing production routing/fallback behavior — flip it on deliberately
 * once the connection has been validated (see scripts/verify-local-ai-connection.mjs).
 */
export function isLocalAiRoutingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOCAL_AI_ENABLED === "1" || env.LOCAL_AI_ENABLED === "true";
}

/** Build routing policies using resolved model IDs (env overrides applied). */
export function buildTaskPolicies(env: NodeJS.ProcessEnv = process.env): Record<AITaskClass, AIRoutingPolicy> {
  const googleCheap = resolveModelId("GOOGLE_CHEAP", env);
  const googleStandard = resolveModelId("GOOGLE_STANDARD", env);
  const openaiNano = resolveModelId("OPENAI_CHEAP_FALLBACK", env);
  const openaiMini = resolveModelId("OPENAI_STANDARD_FALLBACK", env);
  const openaiTerra = resolveModelId("OPENAI_PREMIUM", env);
  const openaiSol = resolveModelId("OPENAI_FRONTIER", env);
  const googleImageFast = resolveModelId("GOOGLE_IMAGE_FAST", env);
  const googleImage = resolveModelId("GOOGLE_IMAGE_STANDARD", env);
  const googleImagePremium = resolveModelId("GOOGLE_IMAGE_PREMIUM", env);
  const openaiImage = resolveModelId("OPENAI_IMAGE_FALLBACK", env);
  const veoLite = resolveModelId("GOOGLE_VIDEO_ECONOMY", env);
  const veoFast = resolveModelId("GOOGLE_VIDEO_FAST", env);
  const veoPremium = resolveModelId("GOOGLE_VIDEO_PREMIUM", env);
  const localChat = resolveModelId("LOCAL_CHAT", env);
  const localCoding = resolveModelId("LOCAL_CODING", env);
  const localAiEnabled = isLocalAiRoutingEnabled(env);

  return {
    ROUTING: policy("ROUTING", [
      { provider: "google", model: googleCheap, role: "primary", reasoningLevel: "minimal" },
      { provider: "openai", model: openaiNano, role: "fallback", reasoningLevel: "none" },
      { provider: "google", model: googleStandard, role: "escalation", reasoningLevel: "low" },
    ]),
    GENERAL_SPECIALIST: policy("GENERAL_SPECIALIST", [
      { provider: "google", model: googleCheap, role: "primary", reasoningLevel: "low" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
      { provider: "google", model: googleStandard, role: "escalation", reasoningLevel: "medium" },
    ]),
    // Genuine quality-based routing (not "local only after every cloud model
    // fails"): when enabled, local is tried FIRST and judged by the same
    // deterministic assessQuality() gate (target 0.72 for CONTENT) every
    // other candidate already goes through — a real gate, not a rubber
    // stamp. A FAIL hops to Gemini, then escalates through OpenAI exactly
    // like today. Disabled by default (LOCAL_AI_ENABLED unset) leaves this
    // byte-for-byte identical to the original Gemini-primary policy.
    CONTENT: policy(
      "CONTENT",
      localAiEnabled
        ? [
            { provider: "local", model: localChat, role: "primary", reasoningLevel: "medium" },
            { provider: "google", model: googleStandard, role: "fallback", reasoningLevel: "low" },
            { provider: "openai", model: openaiMini, role: "escalation", reasoningLevel: "low" },
            { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
          ]
        : [
            { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "low" },
            { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
            { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
          ],
      // 2 escalation-pool candidates either way — default maxQualityEscalations (2) already fits.
    ),
    CONTENT_STRATEGY: policy("CONTENT_STRATEGY", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "medium" },
      { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
    ]),
    CREATIVE_TEXT: policy("CREATIVE_TEXT", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "low" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
      { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
    ]),
    SEO_RESEARCH: policy(
      "SEO_RESEARCH",
      [
        { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
        { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "medium" },
        { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
      ],
      { allowGoogleSearchGrounding: true, allowWebSearch: true },
    ),
    RESEARCH: policy(
      "RESEARCH",
      [
        { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
        { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "medium" },
        { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "high" },
      ],
      { allowGoogleSearchGrounding: true, allowWebSearch: true },
    ),
    STRATEGY: policy("STRATEGY", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
      { provider: "openai", model: openaiTerra, role: "fallback", reasoningLevel: "high" },
      { provider: "openai", model: openaiSol, role: "frontier", reasoningLevel: "high" },
    ]),
    // Real, live production caller: the embedded Website Factory sales-chat
    // widget (app/api/platform/website-factory/[projectId]/agent/chat/route.ts).
    // Quality-gated local-first, same pattern as CONTENT above.
    SALES_CONVERSION: policy(
      "SALES_CONVERSION",
      localAiEnabled
        ? [
            { provider: "local", model: localChat, role: "primary", reasoningLevel: "low" },
            { provider: "google", model: googleCheap, role: "fallback", reasoningLevel: "low" },
            { provider: "openai", model: openaiMini, role: "escalation", reasoningLevel: "low" },
            { provider: "google", model: googleStandard, role: "escalation", reasoningLevel: "medium" },
            { provider: "openai", model: openaiTerra, role: "frontier", reasoningLevel: "medium" },
          ]
        : [
            { provider: "google", model: googleCheap, role: "primary", reasoningLevel: "low" },
            { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
            { provider: "google", model: googleStandard, role: "escalation", reasoningLevel: "medium" },
            { provider: "openai", model: openaiTerra, role: "frontier", reasoningLevel: "medium" },
          ],
      // 3 escalation-pool candidates when enabled (was 2) -- raise the budget
      // so the frontier rung stays reachable.
      localAiEnabled ? { maxQualityEscalations: 3 } : undefined,
    ),
    EXECUTIVE: policy("EXECUTIVE", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
      { provider: "openai", model: openaiTerra, role: "fallback", reasoningLevel: "high" },
      { provider: "openai", model: openaiSol, role: "frontier", reasoningLevel: "high" },
    ]),
    PREMIUM_AUDIT: policy("PREMIUM_AUDIT", [
      { provider: "openai", model: openaiTerra, role: "primary", reasoningLevel: "high" },
      { provider: "google", model: googleStandard, role: "fallback", reasoningLevel: "medium" },
      { provider: "openai", model: openaiSol, role: "frontier", reasoningLevel: "high" },
    ]),
    BRAND_TRUST: policy("BRAND_TRUST", [
      { provider: "google", model: googleCheap, role: "primary", reasoningLevel: "low" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
      { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
    ]),
    ANALYTICS: policy("ANALYTICS", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
      { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
    ]),
    REPORTING: policy("REPORTING", [
      { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
      { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "low" },
      { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "medium" },
    ]),
    WEBSITE_ENGINEERING: policy(
      "WEBSITE_ENGINEERING",
      [
        { provider: "google", model: googleStandard, role: "primary", reasoningLevel: "medium" },
        { provider: "openai", model: openaiMini, role: "fallback", reasoningLevel: "medium" },
        { provider: "openai", model: openaiTerra, role: "escalation", reasoningLevel: "high" },
        { provider: "openai", model: openaiSol, role: "frontier", reasoningLevel: "high" },
        // Opt-in only (LOCAL_AI_ENABLED="1") — appended as a further rung, never
        // touches default routing; maxQualityEscalations raised to 3 below so
        // it is actually reachable alongside the two existing escalations.
        ...(localAiEnabled
          ? [{ provider: "local", model: localCoding, role: "escalation", reasoningLevel: "high" } as const]
          : []),
      ],
      localAiEnabled ? { maxQualityEscalations: 3 } : undefined,
    ),
    IMAGE: policy("IMAGE", [
      { provider: "google", model: googleImage, role: "primary", reasoningLevel: "none" },
      { provider: "google", model: googleImageFast, role: "fallback", reasoningLevel: "none" },
      { provider: "google", model: googleImagePremium, role: "escalation", reasoningLevel: "none" },
      { provider: "openai", model: openaiImage, role: "frontier", reasoningLevel: "none" },
    ]),
    VIDEO: policy("VIDEO", [
      { provider: "google", model: veoLite, role: "primary", reasoningLevel: "none" },
      { provider: "google", model: veoFast, role: "escalation", reasoningLevel: "none" },
      { provider: "google", model: veoPremium, role: "frontier", reasoningLevel: "none" },
    ]),
    VOICE: policy("VOICE", [
      { provider: "openai", model: resolveModelId("REALTIME_VOICE_PRIMARY", env), role: "primary", reasoningLevel: "low" },
      {
        provider: "google",
        model: resolveModelId("REALTIME_VOICE_GOOGLE_FALLBACK", env),
        role: "fallback",
        reasoningLevel: "low",
      },
    ]),
    TRANSCRIPTION: policy("TRANSCRIPTION", [
      { provider: "openai", model: resolveModelId("NORMAL_TRANSCRIPTION", env), role: "primary", reasoningLevel: "none" },
      { provider: "openai", model: resolveModelId("REALTIME_TRANSCRIPTION", env), role: "fallback", reasoningLevel: "none" },
    ]),
  };
}

export function getTaskPolicy(taskClass: AITaskClass, env: NodeJS.ProcessEnv = process.env): AIRoutingPolicy {
  return buildTaskPolicies(env)[taskClass];
}

export function defaultReasoningForTask(taskClass: AITaskClass): AIReasoningLevel {
  return getTaskPolicy(taskClass).candidates[0]?.reasoningLevel ?? "low";
}

/** Conservative default when task class is unknown — never Sol. */
export function resolveUnknownTaskPolicy(env: NodeJS.ProcessEnv = process.env): AIRoutingPolicy {
  return getTaskPolicy("GENERAL_SPECIALIST", env);
}

export const DEFAULT_MONTHLY_BUDGET_USD: Record<Exclude<PlanTier, "custom">, number> = {
  starter: 8.4,
  growth: 17.3,
  business: 36.7,
  scale: 68.2,
};

export function resolveMonthlyBudgetUsd(plan: PlanTier, env: NodeJS.ProcessEnv = process.env): number | null {
  if (plan === "custom") return null;
  const envMap: Record<Exclude<PlanTier, "custom">, string> = {
    starter: "AI_MONTHLY_BUDGET_STARTER_USD",
    growth: "AI_MONTHLY_BUDGET_GROWTH_USD",
    business: "AI_MONTHLY_BUDGET_BUSINESS_USD",
    scale: "AI_MONTHLY_BUDGET_SCALE_USD",
  };
  const override = env[envMap[plan]]?.trim();
  if (override && Number.isFinite(Number(override))) return Number(override);
  return DEFAULT_MONTHLY_BUDGET_USD[plan];
}
