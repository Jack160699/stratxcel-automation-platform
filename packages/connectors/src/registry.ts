import type { ConnectorAccessMethod, ConnectorDefinition } from "./types.ts";

/**
 * Execution method priority order (Section 4):
 * 1. Internal native tool
 * 2. MCP
 * 3. Direct API
 * 4. CLI
 * 5. Browser/computer
 */
export const EXECUTION_METHOD_ORDER: readonly ConnectorAccessMethod[] = [
  "native",
  "mcp",
  "api",
  "cli",
  "browser",
] as const;

/**
 * Static catalogue of all 15 Founder connectors.
 * Single source of truth mirrored into `connector_definitions` table.
 */
export const CONNECTOR_REGISTRY: readonly ConnectorDefinition[] = [
  {
    key: "aws",
    label: "AWS",
    category: "infrastructure",
    authMethod: "mcp_managed",
    scopeLevel: "platform",
    declaredCapabilities: [
      "infrastructure.inspect",
      "infrastructure.deploy_verify",
      "infrastructure.ec2",
      "infrastructure.logs",
      "s3.manage",
    ],
    description:
      "StratXcel's own AWS infrastructure (EC2 host, CloudWatch logs, and AWS services). Operated through MCP/CLI access and AWS SDK. Health tracks real worker-heartbeat data and AWS STS API checks.",
    realStatusSource: "@stratxcel/queue getWorkerHealth() against worker_heartbeats and AWS STS verification",
    requiredEnvVars: [],
    supportedAccessMethods: ["native", "mcp", "cli", "api"],
    preferredAccessMethod: "mcp",
  },
  {
    key: "google",
    label: "Google Services",
    category: "data",
    authMethod: "oauth",
    scopeLevel: "both",
    declaredCapabilities: [
      "google.search",
      "google.drive",
      "google.gmail",
      "google.calendar",
      "google.maps",
      "analytics.read",
      "search_console.read",
    ],
    description:
      "Unified Google Workspace & Cloud services (Search, Drive, Gmail, Calendar, Maps, Analytics, Search Console). Authenticates via OAuth 2.0 or Service Account credentials.",
    realStatusSource: "Google OAuth token validation and Google API health checks",
    requiredEnvVars: [],
    supportedAccessMethods: ["api", "oauth" as unknown as ConnectorAccessMethod],
    preferredAccessMethod: "api",
  },
  {
    key: "google_ai_pro",
    label: "Google AI Pro — Founder Account",
    category: "ai",
    authMethod: "oauth",
    scopeLevel: "platform",
    declaredCapabilities: [
      "google_ai_pro.reasoning",
      "google_ai_pro.multimodal",
      "google_ai_pro.vision",
      "image.generate",
      "image.edit",
      "google_ai_pro.image_generation",
      "video.generate",
      "video.transform",
      "google_ai_pro.video_generation",
      "antigravity.code",
      "antigravity.plan",
      "antigravity.terminal",
      "antigravity.browser",
      "antigravity.verify",
      "jules.automate",
      "google_drive.read",
      "google_drive.write",
      "google_drive.upload",
      "google_drive.download",
      "google_drive.organize",
      "google_cloud.projects",
      "google_cloud.services",
      "colab.notebook",
      "firebase.resources",
    ],
    description:
      "Founder personal Google AI Pro subscription account. Provides entitled multimodal reasoning, Nano Banana image generation, Veo video creation, Antigravity autonomous coding, and personal Drive/Cloud storage. Distinct from developer Gemini API and company Google Workspace.",
    realStatusSource: "Google OAuth account authorization and AI Pro entitlement verification",
    requiredEnvVars: [],
    supportedAccessMethods: ["native", "mcp", "api", "browser"],
    preferredAccessMethod: "native",
  },
  {
    key: "google_workspace",
    label: "Google Workspace (Legacy)",
    category: "data",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["analytics.read", "search_console.read"],
    description:
      "A company's own Google OAuth for Search Console + GA4. Reads the real search_google_connections table (Search & Discovery engine flow).",
    realStatusSource: "search_google_connections.status, read-only adapter",
    requiredEnvVars: [],
    supportedAccessMethods: ["api"],
    preferredAccessMethod: "api",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    category: "ai",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["ai.text", "ai.text_escalation", "ai.code"],
    description:
      "OpenRouter AI resource pool for multi-model inference and fallback routing. Health is verified via probeOpenRouterReadiness live check against OPENROUTER_API_KEY or vaulted key.",
    realStatusSource: "@stratxcel/ai-runtime probeOpenRouterReadiness() live check",
    requiredEnvVars: ["OPENROUTER_API_KEY", "OPENROUTER_ENABLED"],
    supportedAccessMethods: ["native", "api"],
    preferredAccessMethod: "native",
  },
  {
    key: "gemini",
    label: "Gemini (Google AI)",
    category: "ai",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["media.image_generation", "media.video_generation", "ai.text", "ai.multimodal"],
    description:
      "Google AI Studio/Gemini API for text, multimodal vision, and media generation. Health is verified via probeGeminiReadiness live check against GEMINI_API_KEY or vaulted key.",
    realStatusSource: "@stratxcel/ai-runtime probeGeminiReadiness() live check against GEMINI_API_KEY",
    requiredEnvVars: ["GEMINI_API_KEY"],
    supportedAccessMethods: ["native", "api"],
    preferredAccessMethod: "native",
  },
  {
    key: "claude",
    label: "Claude (Anthropic)",
    category: "ai",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["ai.text", "ai.code", "ai.reasoning"],
    description:
      "Anthropic Claude API for advanced architecture, reasoning, and autonomous agent tasks. Authenticated via ANTHROPIC_API_KEY or vaulted key.",
    realStatusSource: "Anthropic API models probe against ANTHROPIC_API_KEY or vaulted key",
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
    supportedAccessMethods: ["native", "api"],
    preferredAccessMethod: "native",
  },
  {
    key: "github",
    label: "GitHub",
    category: "infrastructure",
    authMethod: "service_credential",
    scopeLevel: "platform",
    declaredCapabilities: ["infrastructure.repo_read", "infrastructure.repo_write", "infrastructure.ci_inspect"],
    description:
      "StratXcel source repository, issue tracking, and CI/CD operations. Authenticated via vaulted fine-grained PAT or GitHub App. Real live check against GET https://api.github.com/user.",
    realStatusSource: "GET https://api.github.com/user with the vaulted PAT",
    requiredEnvVars: [],
    supportedAccessMethods: ["api", "cli", "mcp"],
    preferredAccessMethod: "api",
  },
  {
    key: "meta",
    label: "Meta (Facebook / Instagram)",
    category: "social",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["messaging.send", "messaging.receive", "social.post", "social.analytics"],
    description:
      "Meta Business Cloud API messaging surface (WhatsApp Cloud) and social publishing. Reads real phone_bindings and social_accounts.",
    realStatusSource: "phone_bindings.status, read-only adapter and Graph API check",
    requiredEnvVars: [],
    supportedAccessMethods: ["api"],
    preferredAccessMethod: "api",
  },
  {
    key: "whatsapp",
    label: "WhatsApp Cloud API",
    category: "messaging",
    authMethod: "oauth",
    scopeLevel: "company",
    declaredCapabilities: ["messaging.send", "messaging.receive", "messaging.templates"],
    description:
      "WhatsApp Cloud API messaging for company operations. Reads the real, already-live phone_bindings table from Admin > Integrations.",
    realStatusSource: "phone_bindings.status, read-only adapter",
    requiredEnvVars: [],
    supportedAccessMethods: ["api"],
    preferredAccessMethod: "api",
  },
  {
    key: "vercel",
    label: "Vercel",
    category: "infrastructure",
    authMethod: "api_key",
    scopeLevel: "both",
    declaredCapabilities: ["website.deploy_status", "website.domain_status", "website.deploy"],
    description:
      "Website hosting & preview deployments. Company connections read search_website_connections; platform connections validate via validateVercelToken.",
    realStatusSource: "company-scoped: search_website_connections; platform-scoped: validateVercelToken() against vaulted token",
    requiredEnvVars: [],
    supportedAccessMethods: ["api", "cli"],
    preferredAccessMethod: "api",
  },
  {
    key: "supabase",
    label: "Supabase",
    category: "data",
    authMethod: "service_credential",
    scopeLevel: "platform",
    declaredCapabilities: ["data.inspect", "data.query", "data.migrate"],
    description:
      "StratXcel's primary Postgres, Storage, and Realtime platform. Health is validated via live database query ping.",
    realStatusSource: "Live authenticated Postgres query ping against Supabase instance",
    requiredEnvVars: [],
    supportedAccessMethods: ["native", "api", "cli"],
    preferredAccessMethod: "native",
  },
  {
    key: "browser",
    label: "Browser / Computer",
    category: "automation",
    authMethod: "mcp_managed",
    scopeLevel: "platform",
    declaredCapabilities: ["browser.navigate", "browser.extract", "browser.interact", "browser.screenshot"],
    description:
      "Browser/computer automation engine for web-action execution when direct APIs do not exist. Used strictly as web-action fallback.",
    realStatusSource: "Headless browser execution environment readiness probe",
    requiredEnvVars: [],
    supportedAccessMethods: ["native", "mcp", "browser"],
    preferredAccessMethod: "mcp",
  },
  {
    key: "s3",
    label: "AWS S3 Storage",
    category: "data",
    authMethod: "service_credential",
    scopeLevel: "both",
    declaredCapabilities: ["storage.read", "storage.write", "storage.upload", "storage.list"],
    description:
      "Object storage for media assets, reports, and mission backups. Configurable via AWS S3 credentials or vaulted secret.",
    realStatusSource: "S3 authenticated client bucket check",
    requiredEnvVars: [],
    supportedAccessMethods: ["native", "api", "cli", "mcp"],
    preferredAccessMethod: "native",
  },
  {
    key: "apollo",
    label: "Apollo.io",
    category: "data",
    authMethod: "api_key",
    scopeLevel: "both",
    declaredCapabilities: ["leads.search", "leads.enrich", "leads.verify"],
    description:
      "B2B market discovery, lead intelligence, and company contact enrichment. Authenticates via APOLLO_API_KEY or vaulted key.",
    realStatusSource: "Apollo.io API health probe (GET https://api.apollo.io/v1/auth/health)",
    requiredEnvVars: ["APOLLO_API_KEY"],
    supportedAccessMethods: ["api"],
    preferredAccessMethod: "api",
  },
  {
    key: "payments",
    label: "Payments (Razorpay / Stripe)",
    category: "finance",
    authMethod: "api_key",
    scopeLevel: "both",
    declaredCapabilities: ["payments.charge", "payments.refund", "payments.subscriptions", "payments.invoices"],
    description:
      "Payment processing engine for subscription billing, payment links, and invoices. Reads Razorpay/Stripe integration credentials.",
    realStatusSource: "Razorpay/Stripe credentials probe against API endpoint",
    requiredEnvVars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    supportedAccessMethods: ["native", "api"],
    preferredAccessMethod: "native",
  },
  {
    key: "telegram",
    label: "Telegram Bot API",
    category: "messaging",
    authMethod: "api_key",
    scopeLevel: "platform",
    declaredCapabilities: ["messaging.send", "messaging.receive", "messaging.webhook"],
    description:
      "Telegram bot messaging channel for Founder alerts, interactive commands, and Hermes mission updates. Authenticated via bot token.",
    realStatusSource: "Telegram Bot API probe (GET https://api.telegram.org/bot<token>/getMe)",
    requiredEnvVars: ["TELEGRAM_BOT_TOKEN"],
    supportedAccessMethods: ["api"],
    preferredAccessMethod: "api",
  },
] as const;

export function getConnectorDefinition(key: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.key === key);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return [...CONNECTOR_REGISTRY];
}

/**
 * Resolves the preferred execution method for a given capability on a connector,
 * respecting the strict priority:
 * 1. Native internal tool
 * 2. MCP
 * 3. Direct API
 * 4. CLI
 * 5. Browser/computer
 */
export function resolvePreferredExecutionMethod(
  def: ConnectorDefinition,
  allowedMethods?: ConnectorAccessMethod[] | null
): ConnectorAccessMethod {
  const candidates = allowedMethods && allowedMethods.length > 0 ? allowedMethods : def.supportedAccessMethods;
  for (const method of EXECUTION_METHOD_ORDER) {
    if (candidates.includes(method)) {
      return method;
    }
  }
  return def.preferredAccessMethod;
}
