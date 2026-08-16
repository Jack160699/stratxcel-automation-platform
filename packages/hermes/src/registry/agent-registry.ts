import type { ToolName } from "../types.ts";

export type AgentCategory = "CORE" | "RESEARCH" | "INTELLIGENCE" | "EXECUTION" | "CUSTOMER";
export type ModelTierPolicy = "standard" | "premium" | "fast" | "reasoning";

export interface AgentDefinition {
  id: string;
  name: string;
  category: AgentCategory;
  responsibility: string;
  parentOrchestrator: string | null;
  allowedTools: readonly ToolName[];
  forbiddenTools: readonly ToolName[];
  modelPolicy: {
    tier: ModelTierPolicy;
    recommendedModel: string;
    fallbackModel: string;
    maxTokens: number;
    temperature: number;
  };
  budgetPolicy: {
    maxCostCentsPerRun: number;
    maxExecutionTimeMs: number;
    maxRetries: number;
  };
  approvalRequirements: {
    requiresHumanApproval: boolean;
    approvalTriggerConditions?: string[];
  };
  tenantScope: "STRICT_TENANT" | "PLATFORM_ADMIN";
  databasePermissions: readonly string[];
}

export const STRATXCEL_AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // CORE
  "stratxcel-orchestrator": {
    id: "stratxcel-orchestrator",
    name: "StratXcel Business Orchestrator",
    category: "CORE",
    responsibility: "Top-level orchestrator. Dispatches missions, delegates to specialist agents, tracks execution DAG, and validates outcomes.",
    parentOrchestrator: null,
    allowedTools: [
      "get_brand_context",
      "get_service_definition",
      "create_draft_artifact",
      "update_mission_progress",
      "request_approval",
      "get_approval_status",
      "create_human_handoff",
      "attach_research_evidence",
    ],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "reasoning",
      recommendedModel: "gemini-3.6-pro",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 4000,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 50,
      maxExecutionTimeMs: 120_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["missions:read_write", "brand_brains:read", "approvals:read_write"],
  },

  // RESEARCH
  "website-discovery-agent": {
    id: "website-discovery-agent",
    name: "Website Discovery Agent",
    category: "RESEARCH",
    responsibility: "Discovers and extracts technical and structural facts from public websites with bounded crawl budgets and SSRF safety.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request", "create_crm_lead"],
    modelPolicy: {
      tier: "fast",
      recommendedModel: "gemini-3.5-flash-lite",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 2000,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 10,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "website-business-agent": {
    id: "website-business-agent",
    name: "Website Business Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Extracts business model, industry, operating locations, offerings, and maturity facts with evidence citations.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2000,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "seo-intelligence-agent": {
    id: "seo-intelligence-agent",
    name: "SEO Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Analyzes technical SEO, on-page structure, metadata, indexability, LocalBusiness schema, and search discoverability.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2500,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "brand-intelligence-agent": {
    id: "brand-intelligence-agent",
    name: "Brand Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Determines brand positioning, value proposition, voice, tone, personality, and differentiators to update Brand Brain.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.6-pro",
      maxTokens: 2500,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 20,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["brand_brains:read_write", "brand_brain_versions:read_write"],
  },

  "audience-intelligence-agent": {
    id: "audience-intelligence-agent",
    name: "Audience Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Identifies B2B/B2C orientation, customer segments, and target demographics from public evidence.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2000,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "trust-intelligence-agent": {
    id: "trust-intelligence-agent",
    name: "Trust & Reputation Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Extracts public reviews, testimonials, ratings, certifications, policies, and social proof signals.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "fast",
      recommendedModel: "gemini-3.5-flash-lite",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 2000,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 10,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "conversion-intelligence-agent": {
    id: "conversion-intelligence-agent",
    name: "Conversion & Friction Intelligence Agent",
    category: "RESEARCH",
    responsibility: "Analyzes contact mechanisms, WhatsApp buttons, forms, phone links, CTAs, and booking flows for conversion leaks.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2000,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "digital-presence-agent": {
    id: "digital-presence-agent",
    name: "Digital Presence & Assets Agent",
    category: "RESEARCH",
    responsibility: "Maps digital footprint across Website, Google Business, Meta, Instagram, LinkedIn, and identifies missing channels without forcing them.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "fast",
      recommendedModel: "gemini-3.5-flash-lite",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 2000,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 10,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  "competitor-research-agent": {
    id: "competitor-research-agent",
    name: "Competitor Research Agent",
    category: "RESEARCH",
    responsibility: "Gathers verifiable competitive signals and market benchmarks based strictly on evidence.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["attach_research_evidence", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.6-pro",
      maxTokens: 2500,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 20,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_evidence:read_write"],
  },

  // INTELLIGENCE
  "requirement-intelligence-agent": {
    id: "requirement-intelligence-agent",
    name: "Requirement Intelligence Agent",
    category: "INTELLIGENCE",
    responsibility: "Synthesizes evidence into prioritized business requirements (REQUIRED, HIGH, MEDIUM, LOW, NOT_CURRENTLY_REQUIRED). Never forces irrelevant services.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "reasoning",
      recommendedModel: "gemini-3.6-pro",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 3500,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 30,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["business_requirements:read_write", "business_evidence:read"],
  },

  "service-architecture-agent": {
    id: "service-architecture-agent",
    name: "Service Architecture Agent",
    category: "INTELLIGENCE",
    responsibility: "Maps prioritized requirements into modular StratXcel service definitions and calculates required units.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_service_definition", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2500,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["service_catalog_v2:read"],
  },

  "pricing-intelligence-agent": {
    id: "pricing-intelligence-agent",
    name: "Pricing Intelligence & Cost Agent",
    category: "INTELLIGENCE",
    responsibility: "Deterministically computes internal costs and market MRP. Never invents arbitrary prices.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_service_definition", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2000,
      temperature: 0.0,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 10,
      maxExecutionTimeMs: 20_000,
      maxRetries: 1,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["service_catalog_v2:read"],
  },

  "plan-architecture-agent": {
    id: "plan-architecture-agent",
    name: "Plan Architecture Agent",
    category: "INTELLIGENCE",
    responsibility: "Generates tailored Recommended Premium Plan and Standard Alternative with transparent quantity, quality, and frequency tradeoffs.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "get_service_definition", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "reasoning",
      recommendedModel: "gemini-3.6-pro",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 3500,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 25,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["plan_versions:read_write"],
  },

  // EXECUTION
  "execution-planner-agent": {
    id: "execution-planner-agent",
    name: "Execution Planner Agent",
    category: "EXECUTION",
    responsibility: "Translates active plan entitlements into a 30-day autonomous execution DAG with strict entitlement bounds.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "get_service_definition", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "reasoning",
      recommendedModel: "gemini-3.6-pro",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 3500,
      temperature: 0.2,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 30,
      maxExecutionTimeMs: 60_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["missions:read_write"],
  },

  "content-agent": {
    id: "content-agent",
    name: "Content Generation Agent",
    category: "EXECUTION",
    responsibility: "Generates on-brand copy, captions, article drafts, and messaging aligned with Brand Brain.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "create_draft_artifact", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "premium",
      recommendedModel: "gemini-3.6-pro",
      fallbackModel: "gemini-3.6-flash",
      maxTokens: 4000,
      temperature: 0.7,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 35,
      maxExecutionTimeMs: 60_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["mission_artifacts:read_write"],
  },

  "social-agent": {
    id: "social-agent",
    name: "Social Autopilot Agent",
    category: "EXECUTION",
    responsibility: "Plans social calendars and coordinates publishing workflows within plan entitlement limits.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "query_publication_status", "request_approval", "get_approval_status", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2500,
      temperature: 0.5,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 20,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: true, approvalTriggerConditions: ["external_publish_to_social"] },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["social_posts:read_write", "approvals:read_write"],
  },

  "seo-execution-agent": {
    id: "seo-execution-agent",
    name: "SEO & Content Optimization Agent",
    category: "EXECUTION",
    responsibility: "Creates SEO article briefs, on-page optimization recommendations, and keyword mapping.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "create_draft_artifact", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.6-pro",
      maxTokens: 3000,
      temperature: 0.3,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 25,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["mission_artifacts:read_write"],
  },

  "ads-agent": {
    id: "ads-agent",
    name: "Paid Advertising & Campaign Agent",
    category: "EXECUTION",
    responsibility: "Plans ad copy variants, creative targeting, and campaign structures under strict spend approval gates.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "create_draft_artifact", "request_approval", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.6-pro",
      maxTokens: 3000,
      temperature: 0.4,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 25,
      maxExecutionTimeMs: 45_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: true, approvalTriggerConditions: ["ad_spend_commitment"] },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["mission_artifacts:read_write", "approvals:read_write"],
  },

  "analytics-agent": {
    id: "analytics-agent",
    name: "Analytics & Performance Agent",
    category: "EXECUTION",
    responsibility: "Synthesizes measured performance signals into actionable learnings and logs deliverables into the Value Ledger.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: ["get_brand_context", "update_mission_progress"],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 2500,
      temperature: 0.1,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 15,
      maxExecutionTimeMs: 30_000,
      maxRetries: 2,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["value_ledger:read_write"],
  },

  // CUSTOMER
  "customer-copilot-agent": {
    id: "customer-copilot-agent",
    name: "WhatsApp Customer Copilot Agent",
    category: "CUSTOMER",
    responsibility: "Conversational customer interface on WhatsApp. Answers questions, processes commands within entitlements, seeks approvals, and delivers reports.",
    parentOrchestrator: "stratxcel-orchestrator",
    allowedTools: [
      "get_brand_context",
      "get_service_definition",
      "query_publication_status",
      "get_approval_status",
      "update_mission_progress",
    ],
    forbiddenTools: ["submit_publish_request", "create_website_change_request"],
    modelPolicy: {
      tier: "standard",
      recommendedModel: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      maxTokens: 1500,
      temperature: 0.3,
    },
    budgetPolicy: {
      maxCostCentsPerRun: 10,
      maxExecutionTimeMs: 25_000,
      maxRetries: 1,
    },
    approvalRequirements: { requiresHumanApproval: false },
    tenantScope: "STRICT_TENANT",
    databasePermissions: ["tenant_members:read", "plan_versions:read", "value_ledger:read"],
  },
};

export function getAgentDefinition(agentId: string): AgentDefinition | undefined {
  return STRATXCEL_AGENT_REGISTRY[agentId];
}

export function listAgents(): AgentDefinition[] {
  return Object.values(STRATXCEL_AGENT_REGISTRY);
}
