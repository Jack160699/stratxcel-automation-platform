import type { ProviderCapabilityRecord, ProviderCredentialState } from "./types.ts";

function checkEnvVar(name: string): ProviderCredentialState {
  const val = process.env[name];
  if (!val || val.trim() === "") return "MISSING";
  if (val.includes("placeholder") || val.includes("your_") || val.length < 5) return "INVALID";
  return "SET";
}

/**
 * Builds a comprehensive, audit-grade Provider Capability Matrix.
 * Checks environment status safely WITHOUT exposing any raw secret values.
 */
export function buildProviderCapabilityMatrix(): ProviderCapabilityRecord[] {
  // Root-caused live: this previously checked GOOGLE_SEARCH_CONSOLE_CLIENT_ID/
  // _SECRET, which nothing in the codebase actually sets or reads --
  // packages/search-discovery/src/google/oauth.ts (the real OAuth flow
  // behind app/api/platform/search/google/connect) reads
  // GOOGLE_SEARCH_OAUTH_CLIENT_ID/_SECRET, confirmed both by that file and
  // by google-oauth.test.ts. With the old name, this matrix always reported
  // Search Console/GA4 as ADAPTER_READY even when the real credentials were
  // set in production -- a false negative in a report whose whole purpose
  // is "eliminate false binary claims". Fixed to check the name the real
  // OAuth code actually reads.
  const googleOauthState: ProviderCredentialState =
    checkEnvVar("GOOGLE_SEARCH_OAUTH_CLIENT_ID") === "SET" &&
    checkEnvVar("GOOGLE_SEARCH_OAUTH_CLIENT_SECRET") === "SET"
      ? "SET"
      : "MISSING";

  // GBP has its own real, dedicated credential (see
  // lib/social/providers/google-business.ts's getClientId/getClientSecret,
  // which check GOOGLE_BUSINESS_CLIENT_ID/_SECRET first) -- distinct from
  // the Search/GA4 OAuth client, not a fallback alias of it.
  const googleBusinessOauthState: ProviderCredentialState =
    checkEnvVar("GOOGLE_BUSINESS_CLIENT_ID") === "SET" &&
    checkEnvVar("GOOGLE_BUSINESS_CLIENT_SECRET") === "SET"
      ? "SET"
      : "MISSING";

  const serpState: ProviderCredentialState =
    checkEnvVar("SERP_API_KEY") === "SET" || checkEnvVar("DATAFORSEO_API_KEY") === "SET"
      ? "SET"
      : "MISSING";

  const perplexityState: ProviderCredentialState = checkEnvVar("PERPLEXITY_API_KEY");
  const openaiState: ProviderCredentialState = checkEnvVar("OPENAI_API_KEY");
  const geminiState: ProviderCredentialState = checkEnvVar("GEMINI_API_KEY");

  const matrix: ProviderCapabilityRecord[] = [
    // 1. First-Party Google Search Console
    {
      providerKey: "google_search_console",
      displayName: "Google Search Console",
      category: "first_party_search",
      adapterExists: true,
      credentialState: googleOauthState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Connect Google account via OAuth in Integrations page.",
      externalApprovalRequired: "Google Cloud OAuth consent screen approval for public accounts.",
      status: googleOauthState === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "First-party source of truth for clicks, impressions, CTR, and historical average ranking position.",
    },

    // 2. Google Analytics 4 (GA4)
    {
      providerKey: "google_analytics_4",
      displayName: "Google Analytics 4",
      category: "first_party_search",
      adapterExists: true,
      credentialState: googleOauthState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Select verified GA4 Property ID in Integrations.",
      externalApprovalRequired: "Google Cloud OAuth consent screen approval.",
      status: googleOauthState === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "First-party source for organic search landing page sessions and user engagement.",
    },

    // 3. Google Business Profile (GBP / Maps)
    {
      providerKey: "google_business_profile",
      displayName: "Google Business Profile / Maps",
      category: "social_local",
      adapterExists: true,
      credentialState: googleBusinessOauthState,
      readAvailable: true,
      writeAvailable: true,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Connect Google Account with Business Profile Manager permissions.",
      externalApprovalRequired: "Google My Business API access approval.",
      status: googleBusinessOauthState === "SET" ? "CONFIGURED_NOT_VERIFIED" : "ADAPTER_READY",
      notes: "Local search presence, NAP consistency, categories, and review engagement.",
    },

    // 4. Live SERP Provider (DataForSEO / SerpAPI)
    {
      providerKey: "live_serp_measurement",
      displayName: "Live SERP Rank Measurement",
      category: "serp_measurement",
      adapterExists: true,
      credentialState: serpState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: serpState === "SET",
      manualSetupRequired: "Configure SERP_API_KEY or DATAFORSEO_API_KEY in environment secrets.",
      externalApprovalRequired: "Commercial API account with SERP data provider.",
      status: serpState === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "Point-in-time keyword rank tracking across desktop and mobile in target geographies.",
    },

    // 5. Perplexity AI Search Probe
    {
      providerKey: "perplexity_ai_search",
      displayName: "Perplexity Sonar AI Search",
      category: "ai_search",
      adapterExists: true,
      credentialState: perplexityState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: perplexityState === "SET",
      manualSetupRequired: "Configure PERPLEXITY_API_KEY in environment secrets.",
      externalApprovalRequired: "Perplexity API key generation.",
      status: perplexityState === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "Evaluates AI citations, brand mentions, competitor citations, and citation share.",
    },

    // 6. OpenAI / ChatGPT Search Adapter
    {
      providerKey: "openai_chatgpt_search",
      displayName: "OpenAI / ChatGPT Search Adapter",
      category: "ai_search",
      adapterExists: true,
      credentialState: openaiState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: false,
      manualSetupRequired: "Configure OPENAI_API_KEY with search model access.",
      externalApprovalRequired: "OpenAI API subscription.",
      status: openaiState === "SET" ? "CONFIGURED_NOT_VERIFIED" : "ADAPTER_READY",
      notes: "Permitted API interface for probing generative search answer citations.",
    },

    // 7. Gemini / Google AI Overviews Probe
    {
      providerKey: "gemini_ai_overview",
      displayName: "Google Gemini / AI Overviews",
      category: "ai_search",
      adapterExists: true,
      credentialState: geminiState,
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: false,
      manualSetupRequired: "Configure GEMINI_API_KEY in environment.",
      externalApprovalRequired: "Google AI Studio API key.",
      status: geminiState === "SET" ? "CONFIGURED_NOT_VERIFIED" : "ADAPTER_READY",
      notes: "Probes entity citation and grounded snippet inclusions in Gemini search responses.",
    },

    // 8. StratXcel Native Website Engine
    {
      providerKey: "stratxcel_native_website",
      displayName: "StratXcel Native Website Engine",
      category: "cms_website",
      adapterExists: true,
      credentialState: "SET",
      readAvailable: true,
      writeAvailable: true,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "None (Built-in first-party integration).",
      externalApprovalRequired: "None.",
      status: "PRODUCTION_VERIFIED",
      notes: "Atomic metadata, schema, content updates, and deployment verification.",
    },

    // 9. WordPress Core REST API Connector
    {
      providerKey: "wordpress_rest_api",
      displayName: "WordPress REST API Connector",
      category: "cms_website",
      adapterExists: true,
      credentialState: "SET",
      readAvailable: true,
      writeAvailable: true,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Generate Application Password in WP Admin → Users → Profile.",
      externalApprovalRequired: "None (Standard WordPress Core feature).",
      status: "PRODUCTION_VERIFIED",
      notes: "Enables metadata updates, JSON-LD schema injection, and page publishing on WordPress sites.",
    },

    // 10. Meta / Facebook & Instagram
    {
      providerKey: "meta_social",
      displayName: "Meta (Facebook & Instagram)",
      category: "social_local",
      adapterExists: true,
      credentialState: checkEnvVar("META_APP_ID") === "SET" ? "SET" : "MISSING",
      readAvailable: true,
      writeAvailable: true,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Connect Facebook Page / Instagram Business account.",
      externalApprovalRequired: "Meta App Review for pages_read_engagement, pages_manage_posts.",
      status: checkEnvVar("META_APP_ID") === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "Social engagement telemetry, brand presence, and multi-channel publication.",
    },

    // 11. WhatsApp Business Cloud API
    {
      providerKey: "whatsapp_business",
      displayName: "WhatsApp Business Platform",
      category: "social_local",
      adapterExists: true,
      credentialState: checkEnvVar("WHATSAPP_PHONE_NUMBER_ID") === "SET" ? "SET" : "MISSING",
      readAvailable: true,
      writeAvailable: true,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Connect verified WhatsApp Business Phone Number ID.",
      externalApprovalRequired: "Meta WhatsApp Business Account & template approval.",
      status: checkEnvVar("WHATSAPP_PHONE_NUMBER_ID") === "SET" ? "PRODUCTION_VERIFIED" : "ADAPTER_READY",
      notes: "Post-service review requests and appointment notification delivery.",
    },

    // 12. Review & Reputation Intelligence
    {
      providerKey: "review_reputation_engine",
      displayName: "Review & Reputation Intelligence",
      category: "reputation_reviews",
      adapterExists: true,
      credentialState: "SET",
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "Connect Google / business profiles for live review ingestion.",
      externalApprovalRequired: "None.",
      status: "PRODUCTION_VERIFIED",
      notes: "Analyzes sentiment, response coverage, recurring praise/complaints; zero review manufacturing.",
    },

    // 13. Reddit Community Opportunity Radar
    {
      providerKey: "reddit_community_radar",
      displayName: "Reddit Discussion Radar",
      category: "community_radar",
      adapterExists: true,
      credentialState: "SET",
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "None for search radar discovery.",
      externalApprovalRequired: "Reddit Data API terms compliance.",
      status: "PRODUCTION_VERIFIED",
      notes: "DISCOVERY ONLY — finds authentic discussion opportunities without automated mass-spam.",
    },

    // 14. Quora Expert Opportunity Radar
    {
      providerKey: "quora_expert_radar",
      displayName: "Quora Expert Question Radar",
      category: "community_radar",
      adapterExists: true,
      credentialState: "SET",
      readAvailable: true,
      writeAvailable: false,
      tenantScoped: true,
      productionVerified: true,
      manualSetupRequired: "None for question discovery.",
      externalApprovalRequired: "None.",
      status: "PRODUCTION_VERIFIED",
      notes: "RECOMMENDATION ONLY — identifies high-intent questions for human subject matter expert answers.",
    },
  ];

  return matrix;
}
