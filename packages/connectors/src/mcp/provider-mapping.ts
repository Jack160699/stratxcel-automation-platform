import type { ProviderArchitectureMapping } from "./types.ts";

/**
 * Canonical Provider Architecture Mapping
 * Disentangles Service API, CLI, MCP Server, and Browser access layers for every provider.
 */
export const CANONICAL_PROVIDER_MAPPINGS: readonly ProviderArchitectureMapping[] = [
  {
    provider: "AWS",
    serviceApi: {
      available: true,
      type: "AWS SDK v3",
      details: "Full STS, EC2, SSM, S3, CloudWatch API client access",
    },
    cli: {
      available: true,
      command: "aws",
      details: "Windows Root IAM profile (arn:aws:iam::257212469831:root)",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-aws",
      classification: "community",
      details: "mcp-server-aws via stdio / npx (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "AWS Management Console",
      details: "Accessible via Founder Browser session on EC2 and Windows",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Root access exists on Windows CLI; MCP server requires credential configuration; Hermes has no direct AWS tools.",
  },
  {
    provider: "AWS S3",
    serviceApi: {
      available: true,
      type: "AWS S3 Client",
      details: "Direct PutObject, GetObject, ListObjectsV2 API",
    },
    cli: {
      available: true,
      command: "aws s3",
      details: "S3 command-line interface on Windows",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-s3",
      classification: "community",
      details: "@modelcontextprotocol/server-s3 via stdio (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "AWS S3 Console",
      details: "Bucket inspection via Founder Browser",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "StratXcel utilizes Supabase Storage for customer media; direct S3 is available for platform archives.",
  },
  {
    provider: "Meta",
    serviceApi: {
      available: true,
      type: "Meta Graph API v22.0",
      details: "Facebook Pages, Instagram Business, Threads API with AES-256-GCM encrypted tokens",
    },
    cli: {
      available: false,
      command: "none",
      details: "Meta does not provide an official CLI tool",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-meta-dev",
      classification: "custom_stratxcel",
      details: "StratXcel Custom MCP wrapper over Graph API v22.0 (No native Meta MCP exists)",
    },
    browser: {
      available: true,
      sessionType: "Meta Business Suite",
      details: "Manual account administration and verification via browser",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Fully certified in Admin via native Graph API connector; custom MCP wraps publishing and token debugging.",
  },
  {
    provider: "GitHub",
    serviceApi: {
      available: true,
      type: "Octokit REST / GraphQL",
      details: "Vaulted fine-grained PAT (ce1b3474-...) with repo and CI inspection",
    },
    cli: {
      available: true,
      command: "gh",
      details: "GitHub CLI logged in as Jack160699 on Windows with repo/workflow scopes",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-github",
      classification: "official",
      details: "Official @modelcontextprotocol/server-github v0.6.2 (26 tools verified on Windows)",
    },
    browser: {
      available: true,
      sessionType: "GitHub Web",
      details: "Authenticated developer session",
    },
    primaryExecutionEnvironment: "windows",
    notes: "Full official MCP active on Windows; Admin uses Octokit; EC2 runs read-only unauthenticated git clone.",
  },
  {
    provider: "Browser / Playwright",
    serviceApi: {
      available: true,
      type: "Chrome DevTools Protocol (CDP)",
      details: "CDP WebSocket on EC2 port 9222 (Chrome 152)",
    },
    cli: {
      available: false,
      command: "none",
      details: "Browser operations run via CDP protocol or MCP",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-browser",
      classification: "official",
      details: "Official @playwright/mcp@latest with persistent profile D:/pw-profile (24 tools verified)",
    },
    browser: {
      available: true,
      sessionType: "Founder Computer & Workstation Chrome",
      details: "Live RFB-to-WebSocket remote streaming on EC2 port 6080; Playwright on Windows",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Windows runs Playwright MCP; EC2 runs raw Chrome CDP on 9222; Hermes calls browser_* tools.",
  },
  {
    provider: "Google",
    serviceApi: {
      available: true,
      type: "Google Cloud / AI APIs",
      details: "Gemini 1.5/2.0 API, Drive API, Search Console API, GA4 API",
    },
    cli: {
      available: false,
      command: "gcloud",
      details: "GCloud CLI not currently configured in local environment",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-google-drive",
      classification: "community",
      details: "@modelcontextprotocol/server-google-drive via stdio (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "Google Accounts Session",
      details: "Authenticated Google session on EC2 Chrome and Windows profiles",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Google services accessed via Gemini API and Founder Browser session; Google Drive MCP available for doc operations.",
  },
  {
    provider: "Supabase",
    serviceApi: {
      available: true,
      type: "PostgREST & Postgres Direct",
      details: "Connection to project uccqlgeghkwzujeeymua with service role key",
    },
    cli: {
      available: false,
      command: "supabase",
      details: "Supabase CLI is not installed on Windows or EC2",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-supabase",
      classification: "community",
      details: "@modelcontextprotocol/server-postgres via stdio (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "Supabase Dashboard",
      details: "Web dashboard for database administration",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Backbone data layer across Vercel and EC2; MCP server wraps Postgres queries; direct client used everywhere.",
  },
  {
    provider: "Vercel",
    serviceApi: {
      available: true,
      type: "Vercel REST API",
      details: "Custom domain verification, preview deployment status inspection",
    },
    cli: {
      available: true,
      command: "vercel",
      details: "Vercel CLI v59.11.0 installed on Windows (currently unauthenticated)",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-vercel",
      classification: "community",
      details: "vercel-mcp via stdio (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "Vercel Dashboard",
      details: "Production deployment administration",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Hosts production web app; Hermes check_domain_status calls Vercel REST API directly.",
  },
  {
    provider: "OpenAI",
    serviceApi: {
      available: true,
      type: "OpenAI REST API",
      details: "Chat completions and embeddings using OPENAI_API_KEY",
    },
    cli: {
      available: false,
      command: "none",
      details: "OpenAI accessed strictly via API",
    },
    mcp: {
      available: false,
      mcpId: "stratxcel-openai",
      classification: "no_native_mcp",
      details: "No native OpenAI MCP server; OpenAI is an inference engine, not a tool server",
    },
    browser: {
      available: true,
      sessionType: "ChatGPT Web",
      details: "Interactive ChatGPT browser session",
    },
    primaryExecutionEnvironment: "multi_environment",
    notes: "Direct API provider configured as fallback in Hermes mission worker AI router.",
  },
  {
    provider: "CodeCraft",
    serviceApi: {
      available: true,
      type: "CodeCraft REST API",
      details: "Authenticated via CODECRAFT_API_KEY in .env.local",
    },
    cli: {
      available: false,
      command: "none",
      details: "CodeCraft API access only",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-codecraft",
      classification: "custom_stratxcel",
      details: "Custom StratXcel MCP wrapper for CodeCraft automated coding (AUTH_REQUIRED)",
    },
    browser: {
      available: false,
      sessionType: "none",
      details: "No browser session required",
    },
    primaryExecutionEnvironment: "windows",
    notes: "Local workstation development coding tool.",
  },
  {
    provider: "Claude",
    serviceApi: {
      available: false,
      type: "none",
      details: "Direct Anthropic API key is not currently configured in workspace",
    },
    cli: {
      available: true,
      command: "claude",
      details: "Claude Code CLI v2.1.207 authenticated as stratxcelgame@gmail.com",
    },
    mcp: {
      available: false,
      mcpId: "stratxcel-claude",
      classification: "no_native_mcp",
      details: "Claude Code is an MCP Client/Host, not an MCP Server",
    },
    browser: {
      available: true,
      sessionType: "Claude Web",
      details: "Claude.ai interactive browser session",
    },
    primaryExecutionEnvironment: "windows",
    notes: "Standalone terminal agent on founder workstation; acts as MCP consumer.",
  },
  {
    provider: "Telegram",
    serviceApi: {
      available: true,
      type: "Telegram Bot API",
      details: "HTTPS Bot API for alert and operational message dispatch",
    },
    cli: {
      available: false,
      command: "none",
      details: "Telegram CLI not installed",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-telegram",
      classification: "community",
      details: "telegram-mcp via stdio (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "Telegram Web",
      details: "Web browser client",
    },
    primaryExecutionEnvironment: "aws_linux",
    notes: "Target notification channel for Hermes operational and approval alerts.",
  },
  {
    provider: "Apollo.io",
    serviceApi: {
      available: true,
      type: "Apollo REST API v1",
      details: "B2B contact search and lead enrichment API",
    },
    cli: {
      available: false,
      command: "none",
      details: "No Apollo CLI",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-apollo",
      classification: "custom_stratxcel",
      details: "Custom StratXcel MCP wrapper for lead enrichment (AUTH_REQUIRED)",
    },
    browser: {
      available: true,
      sessionType: "Apollo Web App",
      details: "Apollo.io web interface",
    },
    primaryExecutionEnvironment: "aws_linux",
    notes: "Lead prospecting engine for Hermes sales and CRM missions.",
  },
  {
    provider: "WhatsApp",
    serviceApi: {
      available: true,
      type: "WhatsApp Cloud API v22.0",
      details: "Meta Graph API phone bindings with WABA 1420911403384345 and phone ID 993296527209625",
    },
    cli: {
      available: false,
      command: "none",
      details: "No WhatsApp CLI",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-whatsapp",
      classification: "custom_stratxcel",
      details: "Custom StratXcel MCP bridge for template messaging (No native Meta MCP exists)",
    },
    browser: {
      available: true,
      sessionType: "WhatsApp Web",
      details: "Manual chat verification via browser",
    },
    primaryExecutionEnvironment: "aws_linux",
    notes: "Live on EC2 via stratxcel-whatsapp-processor and webhook services.",
  },
  {
    provider: "StratXcel Hermes",
    serviceApi: {
      available: true,
      type: "Hermes Tool Callback REST API",
      details: "POST /tools/:name with mission capability HMAC token",
    },
    cli: {
      available: false,
      command: "none",
      details: "Operates as systemd background daemons",
    },
    mcp: {
      available: true,
      mcpId: "stratxcel-hermes",
      classification: "custom_stratxcel",
      details: "Streamable HTTP MCP server on port 8082 with 10 tools registered (VERIFIED)",
    },
    browser: {
      available: false,
      sessionType: "none",
      details: "Core backend service",
    },
    primaryExecutionEnvironment: "aws_linux",
    notes: "Central MCP bridge connecting autonomous Hermes missions to StratXcel platform tools.",
  },
];

export function getProviderMapping(provider: string): ProviderArchitectureMapping | undefined {
  return CANONICAL_PROVIDER_MAPPINGS.find(
    (p) => p.provider.toLowerCase() === provider.toLowerCase()
  );
}
