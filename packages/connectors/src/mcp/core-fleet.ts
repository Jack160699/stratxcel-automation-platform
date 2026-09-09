/**
 * Core Six Primary MCP Fleet Specifications
 * StratXcel Automation Platform
 *
 * The authoritative definition of the primary six business infrastructure capabilities:
 * 1. AWS (Cloud Infrastructure & Runtimes)
 * 2. Meta Developers (Social Graph, Instagram, Facebook Page APIs)
 * 3. Supabase (Database, Auth, and Multi-Tenant Storage with RLS)
 * 4. Vercel (Frontend Deployments, Production Domains, Serverless Edge)
 * 5. GitHub (Repositories, Pull Requests, Code Versioning)
 * 6. Google (Founder Workspace, Drive, Jules, Gemini AI Studio)
 *
 * Channels (WhatsApp, Telegram, Web chat, Admin chat) are INGRESS surfaces, not MCP targets.
 */

export type CoreProviderDomain = "AWS" | "Meta Developers" | "Supabase" | "Vercel" | "GitHub" | "Google";

export type ExecutionEnvironmentId = "A_WINDOWS" | "B_ADMIN" | "C_AWS_LINUX";

export type CoreMcpRiskLevel = "read_only" | "low" | "medium" | "high" | "destructive";

export type CoreMcpConfirmationPolicy = "autonomous" | "confirmation_required" | "strictly_blocked";

export interface CoreFleetCapabilitySpec {
  capabilityKey: string;
  name: string;
  description: string;
  riskLevel: CoreMcpRiskLevel;
  confirmationPolicy: CoreMcpConfirmationPolicy;
  requiredPermissions: string[];
  isHighConsequence: boolean;
}

export interface CoreFleetProviderSpec {
  provider: CoreProviderDomain;
  mcpName: string;
  transport: "stdio" | "streamable_http" | "rest_client" | "browser_cdp" | "cli_bridge";
  classification: "official" | "custom_stratxcel" | "native_engine" | "service_api_fallback";
  environmentAvailability: {
    A_WINDOWS: {
      supported: boolean;
      executionMethod: "native_mcp_stdio" | "cli" | "browser_profile";
      authSource: string;
    };
    B_ADMIN: {
      supported: boolean;
      executionMethod: "api_client" | "service_role" | "mcp_client";
      authSource: string;
    };
    C_AWS_LINUX: {
      supported: boolean;
      executionMethod: "streamable_http_loopback" | "browser_cdp" | "outbound_worker_bridge";
      authSource: string;
    };
  };
  authSource: string;
  capabilities: CoreFleetCapabilitySpec[];
  tenantScope: "platform" | "company" | "both";
  companyScope: string;
  auditPolicy: "audit_every_invocation";
  fallbackRoute: {
    primary: string;
    secondary: string;
    tertiary?: string;
  };
  healthStatus: "HEALTHY" | "CONFIGURED" | "AUTH_REQUIRED" | "DEGRADED";
}

export const CORE_SIX_FLEET: Record<CoreProviderDomain, CoreFleetProviderSpec> = {
  AWS: {
    provider: "AWS",
    mcpName: "stratxcel-aws",
    transport: "cli_bridge",
    classification: "service_api_fallback",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "cli",
        authSource: "AWS CLI shared credentials (~/.aws/config - IAM Root default profile)",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "api_client",
        authSource: "@aws-sdk/client-ec2 and @aws-sdk/client-ssm via environment credentials",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "streamable_http_loopback",
        authSource: "EC2 Instance Profile and local systemd service environment",
      },
    },
    authSource: "AWS CLI Profile default (arn:aws:iam::257212469831:root)",
    tenantScope: "platform",
    companyScope: "platform_cloud_infrastructure",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "AWS SDK v3 (Direct API Client)",
      secondary: "AWS CLI (Native Shell)",
      tertiary: "AWS Management Console (Founder Browser)",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "aws.infrastructure_inspect",
        name: "Infrastructure Status & Health",
        description: "Inspect EC2 instance state, status checks, and resource metrics",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "aws.ec2_status",
        name: "EC2 Instance Diagnostics",
        description: "Retrieve CPU, memory, and uptime metrics for instance i-044f62e461200dda9 (stratxcel-hermes)",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["ec2:DescribeInstances"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "aws.ssm_command",
        name: "Systems Manager Execution",
        description: "Execute controlled diagnostic commands on AWS Linux via SSM",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["ssm:SendCommand", "ssm:GetCommandInvocation"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "aws.instance_reboot",
        name: "Reboot Cloud Instance",
        description: "Restart EC2 instance during critical recovery operations",
        riskLevel: "destructive",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["ec2:RebootInstances"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "aws.cloudwatch_logs",
        name: "CloudWatch System Logs",
        description: "Query system and deployment logs from AWS CloudWatch",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["logs:GetLogEvents"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "aws.worker_status",
        name: "Worker Fleet Health & Status",
        description: "Inspect AWS background worker processes, heartbeat, and queue status",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["ec2:DescribeInstances"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.create",
        name: "Autonomous Agent Factory Creation",
        description: "Create a governed, least-privilege autonomous agent specification",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:create"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.deploy",
        name: "Deploy Agent 24/7 on AWS",
        description: "Deploy an agent as a persistent 24/7 worker on AWS cloud infrastructure",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:deploy"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.pause",
        name: "Pause Autonomous Agent",
        description: "Temporarily pause execution of an active agent",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:manage"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.resume",
        name: "Resume Autonomous Agent",
        description: "Resume execution of a paused agent",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:manage"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.stop",
        name: "Stop Autonomous Agent",
        description: "Halt execution and stop an agent worker process",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:manage"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.restart",
        name: "Restart Autonomous Agent",
        description: "Restart an agent worker process and reset failure counters",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:manage"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.health",
        name: "Agent Health & Heartbeat Status",
        description: "Inspect live heartbeat timestamp, failure counts, and health status",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "agent.logs",
        name: "Agent Execution Logs",
        description: "Query execution logs and audit events for an agent",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["agent:read"],
        isHighConsequence: false,
      },
    ],
  },

  "Meta Developers": {
    provider: "Meta Developers",
    mcpName: "stratxcel-meta-dev",
    transport: "stdio",
    classification: "custom_stratxcel",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "native_mcp_stdio",
        authSource: "META_APP_ID & META_APP_SECRET in .env.local",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "api_client",
        authSource: "Supabase social_tokens (AES-256-GCM encrypted tokens)",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "outbound_worker_bridge",
        authSource: "Worker task payload HMAC signature with database token lease",
      },
    },
    authSource: "META_APP_ID / META_APP_SECRET & Page Access Tokens",
    tenantScope: "company",
    companyScope: "client_social_autopilot",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "Custom StratXcel Meta MCP Wrapper",
      secondary: "Meta Graph API v19.0 Client",
      tertiary: "Founder Browser Facebook/Instagram Business Suite",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "meta.app_inspect",
        name: "Meta Developer App Inspection",
        description: "Inspect App ID, developer permissions, and webhook subscription state",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["meta:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "meta.debug_token",
        name: "Token Permissions & Expiry Debug",
        description: "Inspect access token scopes, expiration dates, and granted capabilities",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["meta:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "meta.page_read",
        name: "Facebook Page Feed & Metrics",
        description: "Read authorized page posts, comments, follower counts, and reach metrics",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["pages_read_engagement", "pages_show_list"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "meta.instagram_read",
        name: "Instagram Professional Insights",
        description: "Fetch Instagram business profile insights, reel metrics, and impressions",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["instagram_basic", "instagram_manage_insights"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "meta.post_publish",
        name: "Publish Social Content",
        description: "Publish approved social media creative to Facebook Page or Instagram",
        riskLevel: "high",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["pages_manage_posts", "instagram_content_publish"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "meta.intelligence",
        name: "Meta Ecosystem & Social Intelligence",
        description: "Analyze Facebook and Instagram social graph data, page engagement, and audience reach",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["pages_read_engagement", "instagram_basic"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "content.campaign",
        name: "Autonomous Content Campaign Generation",
        description: "Generate structured social post campaigns grounded in brand context with visuals and platform variants",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["social:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "content.review",
        name: "Review Social Content Drafts",
        description: "Review generated social post drafts, hooks, copy, and visual creative assets",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["social:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "content.regenerate",
        name: "Regenerate Content Drafts",
        description: "Regenerate content drafts with refined messaging angles and visual concepts",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["social:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "content.approve",
        name: "Approve Content Campaign",
        description: "Approve generated drafts and stage them for scheduled publishing",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["social:write"],
        isHighConsequence: false,
      },
    ],
  },

  Supabase: {
    provider: "Supabase",
    mcpName: "stratxcel-supabase",
    transport: "rest_client",
    classification: "official",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "cli",
        authSource: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "service_role",
        authSource: "Tenant context service client with strict RLS enforcement",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "streamable_http_loopback",
        authSource: "Local Hermes Gateway DB client with mission token validation",
      },
    },
    authSource: "SUPABASE_SERVICE_ROLE_KEY with Row-Level Security",
    tenantScope: "both",
    companyScope: "tenant_scoped_data",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "Supabase PostgREST REST Client (@supabase/supabase-js)",
      secondary: "Restricted DB Connection Pooler (Port 6543)",
      tertiary: "Supabase Studio (Founder Browser)",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "supabase.customer_query",
        name: "Query Customer / Lead Records",
        description: "Lookup CRM customer records, lead stages, and contact info under tenant RLS",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["leads:read", "tenants:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "supabase.record_update",
        name: "Update Business Record",
        description: "Update lead status, customer attributes, or workflow properties safely",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["leads:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "supabase.schema_inspect",
        name: "Inspect Database Schema",
        description: "Inspect table structure, columns, and foreign keys for safe queries",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["schema:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "supabase.destructive_write",
        name: "Destructive DB Write / Delete",
        description: "Delete records or perform bulk modifications across tables",
        riskLevel: "destructive",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["database:admin"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "mission.status",
        name: "Active Mission & Project Status",
        description: "Retrieve status of active missions, website builds, SEO agents, and content campaigns",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["missions:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "mission.cancel",
        name: "Cancel Active Mission",
        description: "Cancel execution of an in-flight mission or operation",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["missions:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "mission.retry",
        name: "Retry Mission Operation",
        description: "Retry a failed or pending mission step with fresh execution context",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["missions:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "crm.lead_discovery",
        name: "Autonomous Lead Generation & Pipeline Discovery",
        description: "Identify high-value prospective leads, map ICP accounts, and generate qualified CRM opportunities",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["leads:write", "leads:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "growth.plan",
        name: "Growth Strategy & Executive Planning",
        description: "Synthesize marketing, SEO, lead generation, and content into an actionable executive roadmap",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["plans:write", "plans:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "offer.register",
        name: "Register Company Offer",
        description: "Register a canonical product or service offer into the company catalog with pricing and ICP criteria",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["offers:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "offer.list",
        name: "List Company Offers",
        description: "List all active company offers, target segments, and pricing structures",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["offers:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "offer.query",
        name: "Query Company Offer Details",
        description: "Retrieve comprehensive details, positioning, and qualification criteria for a specific offer",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["offers:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "revenue.mission",
        name: "Launch Autonomous Revenue Mission",
        description: "Create an autonomous revenue mission linking offers, ICP lead discovery, SEO, and pipeline execution",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["missions:write", "leads:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "hermes.ceo_objective",
        name: "Autonomous Hermes CEO Objective",
        description: "Executes an end-to-end executive directive with 12-question reasoning, dynamic research, capability enablement, and closed-loop multi-cycle autonomy",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["missions:write", "plans:write"],
        isHighConsequence: false,
      },
    ],
  },

  Vercel: {
    provider: "Vercel",
    mcpName: "stratxcel-vercel",
    transport: "rest_client",
    classification: "official",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "cli",
        authSource: "Vercel CLI / Personal Access Token in environment",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "api_client",
        authSource: "Vercel REST API Client (https://api.vercel.com)",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "streamable_http_loopback",
        authSource: "Hermes Gateway domain and deployment inspector",
      },
    },
    authSource: "Vercel REST API Token & Project Bindings",
    tenantScope: "platform",
    companyScope: "agency_hosting_and_domains",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "Vercel REST API Client",
      secondary: "Vercel CLI (@vercel/nft / npx vercel)",
      tertiary: "Vercel Dashboard (Founder Browser)",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "vercel.deployment_inspect",
        name: "Inspect Deployment State",
        description: "Check status of active, building, or ready deployments on main branch",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["deployments:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "vercel.domain_status",
        name: "Domain DNS & SSL Health",
        description: "Verify production custom domain DNS configuration and SSL certificate",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["domains:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "vercel.production_health",
        name: "Production Website Health",
        description: "Probe production edge latency, HTTP response codes, and deployment SHA",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["deployments:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "vercel.deploy_promote",
        name: "Promote Production Deployment",
        description: "Trigger production deployment build or promote a preview deployment",
        riskLevel: "high",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["deployments:write"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "website.create",
        name: "Create Website from Scratch",
        description: "Orchestrate creation of a new website project shell, coding task, GitHub repository, and Vercel preview deployment",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["websites:write", "deployments:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "website.inquiry",
        name: "Website Capabilities Inquiry",
        description: "Answer user queries on website types, scope, complexity, and options available through StratXcel",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["websites:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "website.modify",
        name: "Modify Website & Design",
        description: "Apply natural language modifications to website hero styling, sections, and CTAs, and redeploy preview",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["websites:write", "deployments:write"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "website.preview",
        name: "Website Live Preview",
        description: "Retrieve and verify the active website preview URL and deployment status",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["websites:read", "deployments:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "website.publish",
        name: "Publish Website to Production",
        description: "Publish verified website preview to live production domain (requires Founder confirmation)",
        riskLevel: "high",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["websites:write", "deployments:write"],
        isHighConsequence: true,
      },
    ],
  },

  GitHub: {
    provider: "GitHub",
    mcpName: "stratxcel-github",
    transport: "stdio",
    classification: "official",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "native_mcp_stdio",
        authSource: "GITHUB_TOKEN in .env.local and Windows Git Credential Manager",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "api_client",
        authSource: "Octokit REST API Client with platform token",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "outbound_worker_bridge",
        authSource: "Hermes outbound worker bridge queue job via Antigravity Worker",
      },
    },
    authSource: "GITHUB_TOKEN (Personal Access Token - User Jack160699)",
    tenantScope: "platform",
    companyScope: "core_codebase",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "GitHub Official MCP Server (stratxcel-github - 26 tools)",
      secondary: "Octokit REST API Client",
      tertiary: "GitHub CLI (gh) on Windows",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "github.repo_read",
        name: "Repository Metadata & Tree",
        description: "Inspect repository branches, commit log, file trees, and release tags",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["repo:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "github.file_read",
        name: "Read Repository File",
        description: "Read contents of any code file, package.json, or workflow definition",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["repo:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "github.branch_status",
        name: "Branch Status & CI Health",
        description: "Inspect git SHA, latest commit author, and GitHub Actions CI workflow state",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["repo:read", "actions:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "github.pr_inspect",
        name: "Inspect Pull Requests",
        description: "List open PRs, read diffs, and inspect reviews and mergeability",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["repo:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "github.push_files",
        name: "Push Code Changes to Branch",
        description: "Commit and push code updates to a repository branch",
        riskLevel: "high",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["repo:write"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "github.create_pr",
        name: "Create Pull Request",
        description: "Open a new pull request for code changes",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["repo:write"],
        isHighConsequence: false,
      },
    ],
  },

  Google: {
    provider: "Google",
    mcpName: "stratxcel-google",
    transport: "browser_cdp",
    classification: "official",
    environmentAvailability: {
      A_WINDOWS: {
        supported: true,
        executionMethod: "browser_profile",
        authSource: "Chromium user profile with stored Google cookies (D:/pw-profile)",
      },
      B_ADMIN: {
        supported: true,
        executionMethod: "api_client",
        authSource: "Google OAuth API & Gemini Platform API",
      },
      C_AWS_LINUX: {
        supported: true,
        executionMethod: "browser_cdp",
        authSource: "Founder Computer headless Chrome (127.0.0.1:9222 - stratxcelsolutions@gmail.com)",
      },
    },
    authSource: "Founder Browser Session (stratxcelsolutions@gmail.com) & Gemini API",
    tenantScope: "both",
    companyScope: "founder_workspace",
    auditPolicy: "audit_every_invocation",
    fallbackRoute: {
      primary: "Founder Browser CDP (Founder Computer Chrome)",
      secondary: "Google Gemini Platform API Client",
      tertiary: "Google Workspace / Drive Web UI",
    },
    healthStatus: "HEALTHY",
    capabilities: [
      {
        capabilityKey: "google.drive_read",
        name: "Read Drive Document",
        description: "Inspect Google Docs, Sheets, or stored files in Google Drive",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["drive.readonly"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "google.drive_search",
        name: "Search Drive Assets",
        description: "Search documents, PDFs, and agency assets across Google Drive",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["drive.readonly"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "google.workspace_inspect",
        name: "Workspace Health & Quota",
        description: "Inspect Google Workspace account status, storage quotas, and services",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["workspace:read"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "google.drive_upload",
        name: "Upload to Drive",
        description: "Save generated deliverables, exports, or media to Google Drive",
        riskLevel: "medium",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["drive.file"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "google.aistudio_prompt",
        name: "Execute AI Studio Prompt",
        description: "Execute advanced multimodal reasoning prompts in Google AI Studio",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["aistudio:execute"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "google.research",
        name: "Google Web & Market Intelligence",
        description: "Conduct verified web and market research using Google and Gemini ecosystem",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["google:search"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "image.generate",
        name: "Autonomous Creative Image Generation",
        description: "Generate brand-grounded images using Google Gemini Image priority and creative fallbacks",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["media:generate"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "video.generate",
        name: "Autonomous Video Generation",
        description: "Generate promotional videos and reels with script, visual plan, and quality verification",
        riskLevel: "medium",
        confirmationPolicy: "confirmation_required",
        requiredPermissions: ["media:generate"],
        isHighConsequence: true,
      },
      {
        capabilityKey: "image.analyze",
        name: "Multimodal Vision & UI Diagnostics",
        description: "Analyze screenshots, charts, product photos, and creative designs with OCR and UI critique",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["vision:analyze"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "file.analyze",
        name: "Document, Spreadsheet & PDF Analysis",
        description: "Analyze PDFs, Word documents, Excel spreadsheets, CSVs, and JSON data files",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["files:analyze"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "link.analyze",
        name: "Browser Web Diagnostics & SEO Audit",
        description: "Inspect live web URLs for UX, SEO, performance, and accessibility flaws",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["browser:navigate"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "seo.launch",
        name: "Launch Autonomous SEO Agent",
        description: "Deploy an autonomous SEO agent to discover high-priority keyword and search opportunities, on-page fixes, and content briefs",
        riskLevel: "low",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["seo:write", "google:search"],
        isHighConsequence: false,
      },
      {
        capabilityKey: "seo.report",
        name: "SEO Audit & Keyword Report",
        description: "Retrieve comprehensive technical SEO recommendations, search intent breakdown, and keyword opportunity report",
        riskLevel: "read_only",
        confirmationPolicy: "autonomous",
        requiredPermissions: ["seo:read"],
        isHighConsequence: false,
      },
    ],
  },
};

/**
 * Returns the specification for a core provider domain.
 */
export function getCoreFleetProvider(provider: CoreProviderDomain): CoreFleetProviderSpec {
  return CORE_SIX_FLEET[provider];
}

/**
 * Lists all core fleet capabilities across the 6 domains.
 */
export function listAllCoreCapabilities(): CoreFleetCapabilitySpec[] {
  return Object.values(CORE_SIX_FLEET).flatMap((p) => p.capabilities);
}
