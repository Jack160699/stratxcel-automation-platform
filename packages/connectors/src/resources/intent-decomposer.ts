/**
 * Natural Language Intent & Multi-Capability Task Decomposer
 * StratXcel Automation Platform - Core Six Fleet
 *
 * Automatically resolves natural-language user commands from any chat channel
 * (WhatsApp, Telegram, Web chat, Admin chat) into canonical core provider capabilities:
 * - aws.*
 * - meta.*
 * - supabase.*
 * - vercel.*
 * - github.*
 * - google.*
 *
 * Automatically handles multi-capability decomposition (e.g. Deploy main -> GitHub + Vercel)
 * and enforces strict confirmation gates on high-consequence operations.
 */

import {
  CORE_SIX_FLEET,
  type CoreProviderDomain,
  type CoreMcpRiskLevel,
  type CoreFleetCapabilitySpec,
} from "../mcp/core-fleet.ts";

export interface DecomposedTask {
  step: number;
  provider: CoreProviderDomain;
  capabilityKey: string;
  actionName: string;
  description: string;
  payload: Record<string, unknown>;
  riskLevel: CoreMcpRiskLevel;
  isHighConsequence: boolean;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
  status: "READY" | "CONFIRMATION_REQUIRED";
}

export interface DecomposedTaskPlan {
  rawQuery: string;
  inferredIntent: string;
  tasks: DecomposedTask[];
  requiresFounderConfirmation: boolean;
  confirmationPrompts: string[];
  tenantScope: string;
  companyScope: string;
  evaluatedAt: string;
}

export interface DecomposeOptions {
  tenantId?: string;
  companyScope?: string;
  confirmedByFounder?: boolean;
  channel?: "whatsapp" | "telegram" | "web" | "admin";
}

/**
 * Finds a capability specification from the Core Six Fleet.
 */
function findCapabilitySpec(capabilityKey: string): { provider: CoreProviderDomain; spec: CoreFleetCapabilitySpec } | null {
  for (const [providerName, providerData] of Object.entries(CORE_SIX_FLEET)) {
    const match = providerData.capabilities.find((c) => c.capabilityKey === capabilityKey);
    if (match) {
      return { provider: providerName as CoreProviderDomain, spec: match };
    }
  }
  return null;
}

/**
 * Creates a decomposed task item from a capability key.
 */
function createTaskFromCapability(
  step: number,
  capabilityKey: string,
  payload: Record<string, unknown> = {},
  confirmedByFounder = false,
  customPrompt?: string
): DecomposedTask {
  const resolved = findCapabilitySpec(capabilityKey);
  if (!resolved) {
    throw new Error(`Unknown core fleet capability: '${capabilityKey}'`);
  }

  const { provider, spec } = resolved;
  const isHighConsequence = spec.isHighConsequence;
  const requiresConfirmation = isHighConsequence && !confirmedByFounder;

  return {
    step,
    provider,
    capabilityKey: spec.capabilityKey,
    actionName: spec.name,
    description: spec.description,
    payload,
    riskLevel: spec.riskLevel,
    isHighConsequence,
    requiresConfirmation,
    confirmationPrompt: requiresConfirmation
      ? customPrompt || `⚠️ Action '${spec.name}' (${spec.capabilityKey}) is high-consequence (${spec.riskLevel.toUpperCase()}). Please reply CONFIRM to authorize execution.`
      : undefined,
    status: requiresConfirmation ? "CONFIRMATION_REQUIRED" : "READY",
  };
}

/**
 * Decomposes natural language commands into canonical task plans across the Core Six.
 */
export function decomposeNaturalLanguageIntent(query: string, options: DecomposeOptions = {}): DecomposedTaskPlan {
  const text = query.trim().toLowerCase();
  const confirmedByFounder = Boolean(options.confirmedByFounder);
  const tenantScope = options.tenantId || "platform-default";
  const companyScope = options.companyScope || "platform-infrastructure";

  const tasks: DecomposedTask[] = [];
  let inferredIntent = "General Infrastructure Inquiry";

  // 1. Direct Capability Key Passthrough (e.g. "aws.ec2_status" or "supabase.customer_query")
  const directMatch = findCapabilitySpec(query.trim());
  if (directMatch) {
    inferredIntent = `Explicit Capability Invocation: ${directMatch.spec.name}`;
    tasks.push(createTaskFromCapability(1, directMatch.spec.capabilityKey, {}, confirmedByFounder));
  }
  // 2. Website Creation Intent ("Can you make a website for me?", "Make me a website", "Build a website for my business", etc.)
  else if (
    (/(?:can\s+you\s+)?(?:make|build|create|launch|start|need|set\s*up|code|develop)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:website|site|landing\s*page|webpage)/i.test(text) ||
      /^(?:make|build|create)\s+(?:a\s+)?(?:new\s+)?(?:website|site|landing\s*page)/i.test(text) ||
      text === "website.create" ||
      text === "website_create_new") &&
    !/\b(?:edit|change|update|fix|modify|inspect|check|status|dns|records)\b/i.test(text)
  ) {
    inferredIntent = "Website Creation from Scratch";
    tasks.push(
      createTaskFromCapability(
        1,
        "website.create",
        {
          goalText: query,
          tenantId: tenantScope,
          companyScope,
        },
        confirmedByFounder
      )
    );
  }
  // 2b. Website Capabilities Inquiry & Follow-up ("What kind of websites and how complex?", "What kind of websites can you create?")
  else if (
    /\b(?:what\s+kind\s+of\s+websites?|how\s+complex|what\s+types?\s+of\s+websites?|what\s+can\s+you\s+build|what\s+websites?\s+can\s+you\s+(?:create|build|make))\b/i.test(text) ||
    (/\b(?:websites?|landing\s*page)\b/i.test(text) && /\b(?:complexity|types?|capabilities?|options?|what\s+can\s+you)\b/i.test(text))
  ) {
    inferredIntent = "Website Capabilities Inquiry";
    tasks.push(createTaskFromCapability(1, "website.inquiry", { query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 2c. Website Selection from Action UI ("Business Website", "Landing Page", "Online Store", "action:website_type:...")
  else if (/^(?:action:website_type:)?(?:business(?:\s+website)?|landing(?:\s*page)?|online\s*store|store)$/i.test(text.trim())) {
    inferredIntent = "Website Creation from Scratch";
    const selectedType = text.replace(/^action:website_type:/i, "").trim();
    tasks.push(
      createTaskFromCapability(
        1,
        "website.create",
        {
          goalText: `Create a ${selectedType} website`,
          purpose: selectedType,
          tenantId: tenantScope,
          companyScope,
        },
        confirmedByFounder
      )
    );
  }
  // 2d. Action UI button callbacks for multimodal assets and website actions
  else if (text === "action:image:analyze") {
    inferredIntent = "Multimodal Image Analysis";
    tasks.push(createTaskFromCapability(1, "image.analyze", { query: "Analyze this image", tenantId: tenantScope }, confirmedByFounder));
  }
  else if (text === "action:image:improve" || text === "action:image:new_version") {
    inferredIntent = "Autonomous Creative Image Generation";
    tasks.push(createTaskFromCapability(1, "image.generate", { brief: "Improve visual design and aesthetics of the provided asset", tenantId: tenantScope }, confirmedByFounder));
  }
  else if (text === "action:image:website") {
    inferredIntent = "Website Creation from Scratch";
    tasks.push(createTaskFromCapability(1, "website.create", { goalText: "Build a website using the provided visual asset", tenantId: tenantScope, companyScope }, confirmedByFounder));
  }
  else if (text === "action:doc:summarize") {
    inferredIntent = "Multimodal File & Document Analysis";
    tasks.push(createTaskFromCapability(1, "file.analyze", { goal: "Summarize this document", tenantId: tenantScope }, confirmedByFounder));
  }
  else if (text === "action:doc:risks") {
    inferredIntent = "Multimodal File & Document Analysis";
    tasks.push(createTaskFromCapability(1, "file.analyze", { goal: "Check risks in this document", tenantId: tenantScope }, confirmedByFounder));
  }
  else if (text === "action:doc:actions") {
    inferredIntent = "Multimodal File & Document Analysis";
    tasks.push(createTaskFromCapability(1, "file.analyze", { goal: "Extract action plan from this document", tenantId: tenantScope }, confirmedByFounder));
  }
  // 3. Agent Factory & 24/7 Deployment Controls ("Create an SEO monitoring agent", "Deploy that agent 24/7", "Pause my SEO agent", "Stop that agent")
  else if (text.includes("agent") || (text.includes("deploy") && text.includes("24/7"))) {
    if (text.includes("create") || text.includes("build") || text.includes("make") || text.includes("setup") || text.includes("watches") || text.includes("monitors")) {
      inferredIntent = "Autonomous Agent Factory Creation";
      tasks.push(createTaskFromCapability(1, "agent.create", { query, tenantId: tenantScope, companyScope }, confirmedByFounder));
    } else if (text.includes("deploy") || text.includes("run 24/7")) {
      inferredIntent = "24/7 AWS Agent Deployment";
      tasks.push(createTaskFromCapability(1, "agent.deploy", { query, tenantId: tenantScope }, confirmedByFounder));
    } else if (text.includes("pause")) {
      inferredIntent = "Pause Autonomous Agent";
      tasks.push(createTaskFromCapability(1, "agent.pause", { query, tenantId: tenantScope }, confirmedByFounder));
    } else if (text.includes("resume")) {
      inferredIntent = "Resume Autonomous Agent";
      tasks.push(createTaskFromCapability(1, "agent.resume", { query, tenantId: tenantScope }, confirmedByFounder));
    } else if (text.includes("stop")) {
      inferredIntent = "Stop Autonomous Agent";
      tasks.push(createTaskFromCapability(1, "agent.stop", { query, tenantId: tenantScope }, confirmedByFounder));
    } else if (text.includes("restart")) {
      inferredIntent = "Restart Autonomous Agent";
      tasks.push(createTaskFromCapability(1, "agent.restart", { query, tenantId: tenantScope }, confirmedByFounder));
    } else {
      inferredIntent = "Agent Health & Status Inquiry";
      tasks.push(createTaskFromCapability(1, "agent.health", { query, tenantId: tenantScope }, confirmedByFounder));
    }
  }
  // 4. Multimodal Image & Visual Understanding ("Analyze this image", "Analyze this screenshot", "Look at this chart")
  else if (
    (text.includes("image") || text.includes("picture") || text.includes("screenshot") || text.includes("chart")) &&
    (text.includes("analyze") || text.includes("look at") || text.includes("inspect") || text.includes("check") || text.includes("tell me") || text.includes("what's") || text.includes("whats"))
  ) {
    inferredIntent = "Multimodal Image & Visual Understanding";
    tasks.push(createTaskFromCapability(1, "image.analyze", { query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 5. Multimodal File, Spreadsheet & PDF Analysis ("Analyze this PDF", "Summarize this Excel", "Find errors in this spreadsheet")
  else if (
    text.includes("pdf") ||
    text.includes("excel") ||
    text.includes("spreadsheet") ||
    text.includes("csv") ||
    (text.includes("proposal") && (text.includes("read") || text.includes("risk"))) ||
    (text.includes("file") && (text.includes("analyze") || text.includes("summarize") || text.includes("compare") || text.includes("extract")))
  ) {
    inferredIntent = "Multimodal File & Document Analysis";
    tasks.push(createTaskFromCapability(1, "file.analyze", { query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 6. Video Generation ("Create a 30-second video", "Turn this image into a short promotional video", "Create a reel")
  else if (text.includes("video") || text.includes("reel") || (text.includes("second") && text.includes("video"))) {
    inferredIntent = "Autonomous Video Generation";
    tasks.push(
      createTaskFromCapability(
        1,
        "video.generate",
        { brief: query, tenantId: tenantScope },
        confirmedByFounder,
        "⚠️ High-consequence: Video generation consumes significant provider quota. Reply 'CONFIRM' to authorize generation."
      )
    );
  }
  // 7. Creative Image Generation ("Create an image for this campaign", "Make an Instagram campaign for this", "Generate a hero image")
  else if (
    (text.includes("image") || text.includes("poster") || text.includes("creative") || text.includes("instagram") || text.includes("campaign")) &&
    (text.includes("create") || text.includes("generate") || text.includes("make") || text.includes("variants"))
  ) {
    inferredIntent = "Autonomous Creative Image Generation";
    tasks.push(createTaskFromCapability(1, "image.generate", { brief: query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 8. Link & Website Diagnostics ("Look at this website and tell me what's wrong", "Analyze this website", URL queries)
  else if (
    (((text.includes("website") || text.includes("site") || text.includes("url")) &&
      (text.includes("what's wrong") || text.includes("analyze") || text.includes("inspect") || text.includes("fix") || text.includes("problem")) &&
      !text.includes("healthy")) ||
      text.startsWith("http://") ||
      text.startsWith("https://"))
  ) {
    inferredIntent = "Browser Link & Web Diagnostics";
    tasks.push(createTaskFromCapability(1, "link.analyze", { url: query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 9. Google Web & Market Research Priority ("Research the Indian EV market", "Research this company", "Check my competitors")
  else if (text.includes("research") || text.includes("market") || text.includes("competitor") || (text.includes("report") && text.includes("morning"))) {
    inferredIntent = "Google Web & Market Research";
    tasks.push(createTaskFromCapability(1, "google.research", { query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 10. Meta Developer & Social Graph Intelligence ("Meta insights", "Facebook page engagement", "Instagram business data")
  else if (text.includes("meta") || (text.includes("instagram") && (text.includes("insight") || text.includes("metric") || text.includes("reach") || text.includes("graph")))) {
    inferredIntent = "Meta Ecosystem & Social Intelligence";
    tasks.push(createTaskFromCapability(1, "meta.intelligence", { query, tenantId: tenantScope }, confirmedByFounder));
  }
  // 11. Deployment Composite Intent ("Deploy the latest main branch", "Deploy to production")
  else if (
    (text.includes("deploy") && (text.includes("main") || text.includes("production") || text.includes("prod") || text.includes("latest"))) ||
    text.startsWith("deploy ")
  ) {
    inferredIntent = "Production Deployment Pipeline";
    // Step 1: Inspect GitHub main branch status & CI
    tasks.push(
      createTaskFromCapability(
        1,
        "github.branch_status",
        { branch: "main", repo: "Jack160699/stratxcel-automation-platform" },
        confirmedByFounder
      )
    );
    // Step 2: Promote/Deploy on Vercel
    tasks.push(
      createTaskFromCapability(
        2,
        "vercel.deploy_promote",
        { environment: "production", branch: "main" },
        confirmedByFounder,
        "⚠️ High-consequence: You are requesting a production deployment on Vercel for branch 'main'. Please reply 'CONFIRM' to proceed with the build."
      )
    );
  }
  // 3. Multi-Provider Health & Diagnostics ("Check whether our production site is healthy and tell me what is wrong")
  else if (
    (text.includes("site") || text.includes("production") || text.includes("system")) &&
    (text.includes("healthy") || text.includes("health") || text.includes("wrong") || text.includes("status") || text.includes("down"))
  ) {
    inferredIntent = "Production Multi-Provider Health Diagnostics";
    // Step 1: Vercel production edge & latency health
    tasks.push(createTaskFromCapability(1, "vercel.production_health", { url: "https://stratxcel.com" }, confirmedByFounder));
    // Step 2: AWS EC2 runtime diagnostics
    tasks.push(createTaskFromCapability(2, "aws.ec2_status", { instanceId: "i-034ea3f8bdf9b3a03" }, confirmedByFounder));
    // Step 3: Domain DNS and SSL certificate verification
    tasks.push(createTaskFromCapability(3, "vercel.domain_status", { domain: "stratxcel.com" }, confirmedByFounder));
  }
  // 4. CRM & Database Updates ("Find the customer record and update their status")
  else if (
    (text.includes("customer") || text.includes("lead") || text.includes("crm")) &&
    (text.includes("update") || text.includes("status") || text.includes("find"))
  ) {
    inferredIntent = "Customer Record Query & Lifecycle Update";
    // Step 1: Supabase Customer Query
    tasks.push(createTaskFromCapability(1, "supabase.customer_query", { tenantId: tenantScope }, confirmedByFounder));
    // Step 2: Supabase Safe Record Update
    tasks.push(createTaskFromCapability(2, "supabase.record_update", { tenantId: tenantScope, status: "QUALIFIED" }, confirmedByFounder));
  }
  // 5. Destructive Database Operations ("Delete customer records", "drop table", "truncate")
  else if (text.includes("delete") && (text.includes("record") || text.includes("customer") || text.includes("lead") || text.includes("database") || text.includes("db"))) {
    inferredIntent = "Database Destructive Operation";
    tasks.push(
      createTaskFromCapability(
        1,
        "supabase.destructive_write",
        { query: query },
        confirmedByFounder,
        "⚠️ High-consequence: You are requesting a destructive database operation. All record modifications require explicit Founder confirmation. Reply 'CONFIRM' to execute."
      )
    );
  }
  // 6. AWS Infrastructure & Diagnostics / Instance Control
  else if (text.includes("aws") || text.includes("ec2") || text.includes("instance") || text.includes("cloud infrastructure")) {
    if (text.includes("reboot") || text.includes("restart") || text.includes("terminate") || text.includes("stop")) {
      inferredIntent = "AWS Cloud Instance Control";
      tasks.push(
        createTaskFromCapability(
          1,
          "aws.instance_reboot",
          { instanceId: "i-044f62e461200dda9" },
          confirmedByFounder,
          "⚠️ High-consequence: You are requesting an EC2 instance reboot (i-044f62e461200dda9). Services will temporarily be unreachable. Reply 'CONFIRM' to authorize."
        )
      );
    } else {
      inferredIntent = "AWS Cloud Infrastructure Diagnostics";
      tasks.push(createTaskFromCapability(1, "aws.infrastructure_inspect", {}, confirmedByFounder));
      tasks.push(createTaskFromCapability(2, "aws.ec2_status", { instanceId: "i-044f62e461200dda9" }, confirmedByFounder));
    }
  }
  // 7. GitHub Repository / Code / PR Operations
  else if (text.includes("github") || text.includes("repository") || text.includes("pull request") || /\bpr\b/.test(text) || text.includes("commit") || text.includes("repo")) {
    if (text.includes("push") || text.includes("commit code") || text.includes("write file")) {
      inferredIntent = "GitHub Code Modification";
      tasks.push(
        createTaskFromCapability(
          1,
          "github.push_files",
          { repo: "Jack160699/stratxcel-automation-platform" },
          confirmedByFounder,
          "⚠️ High-consequence: Pushing direct code modifications to GitHub repository requires confirmation. Reply 'CONFIRM' to proceed."
        )
      );
    } else if (/\bpr\b/.test(text) || text.includes("pull request")) {
      inferredIntent = "GitHub Pull Request Inspection";
      tasks.push(createTaskFromCapability(1, "github.pr_inspect", { repo: "Jack160699/stratxcel-automation-platform" }, confirmedByFounder));
    } else {
      inferredIntent = "GitHub Repository Inspection";
      tasks.push(createTaskFromCapability(1, "github.repo_read", { repo: "Jack160699/stratxcel-automation-platform" }, confirmedByFounder));
    }
  }
  // 8. Meta Developers / Facebook / Instagram
  else if (text.includes("meta") || text.includes("facebook") || text.includes("instagram") || text.includes("social")) {
    if (text.includes("publish") || text.includes("post") || text.includes("share")) {
      inferredIntent = "Meta Social Publishing";
      tasks.push(
        createTaskFromCapability(
          1,
          "meta.post_publish",
          { message: "Scheduled social update" },
          confirmedByFounder,
          "⚠️ High-consequence: Publishing social content to live Facebook/Instagram channels requires confirmation. Reply 'CONFIRM' to authorize publishing."
        )
      );
    } else if (text.includes("instagram") || text.includes("ig")) {
      inferredIntent = "Instagram Business Insights Inspection";
      tasks.push(createTaskFromCapability(1, "meta.instagram_read", {}, confirmedByFounder));
    } else if (text.includes("token") || text.includes("debug") || text.includes("permission")) {
      inferredIntent = "Meta Access Token Debugging";
      tasks.push(createTaskFromCapability(1, "meta.debug_token", {}, confirmedByFounder));
    } else {
      inferredIntent = "Meta Developer App Inspection";
      tasks.push(createTaskFromCapability(1, "meta.app_inspect", {}, confirmedByFounder));
      tasks.push(createTaskFromCapability(2, "meta.page_read", {}, confirmedByFounder));
    }
  }
  // 9. Google Workspace / Drive / AI Studio
  else if (text.includes("google") || text.includes("drive") || text.includes("workspace") || text.includes("doc") || text.includes("sheet") || text.includes("ai studio")) {
    if (text.includes("upload") || text.includes("save to drive")) {
      inferredIntent = "Google Drive Asset Upload";
      tasks.push(createTaskFromCapability(1, "google.drive_upload", { filename: "export.pdf" }, confirmedByFounder));
    } else if (text.includes("prompt") || text.includes("ai studio")) {
      inferredIntent = "Google AI Studio Reasoning Execution";
      tasks.push(createTaskFromCapability(1, "google.aistudio_prompt", { prompt: query }, confirmedByFounder));
    } else if (text.includes("search") || text.includes("find doc")) {
      inferredIntent = "Google Drive Asset Search";
      tasks.push(createTaskFromCapability(1, "google.drive_search", { query }, confirmedByFounder));
    } else {
      inferredIntent = "Google Workspace & Drive Inspection";
      tasks.push(createTaskFromCapability(1, "google.workspace_inspect", {}, confirmedByFounder));
      tasks.push(createTaskFromCapability(2, "google.drive_read", {}, confirmedByFounder));
    }
  }
  // 10. Vercel Deployments & Domains Direct
  else if (text.includes("vercel") || text.includes("domain") || text.includes("dns") || text.includes("ssl")) {
    inferredIntent = "Vercel Hosting & Domain Inspection";
    tasks.push(createTaskFromCapability(1, "vercel.domain_status", { domain: "stratxcel.com" }, confirmedByFounder));
    tasks.push(createTaskFromCapability(2, "vercel.deployment_inspect", {}, confirmedByFounder));
  }
  // 11. Supabase Database Direct
  else if (text.includes("supabase") || text.includes("database") || text.includes("db") || text.includes("schema") || text.includes("table")) {
    inferredIntent = "Supabase Database Schema & Data Inspection";
    tasks.push(createTaskFromCapability(1, "supabase.schema_inspect", {}, confirmedByFounder));
    tasks.push(createTaskFromCapability(2, "supabase.customer_query", { tenantId: tenantScope }, confirmedByFounder));
  }
  // 12. Fallback Generic System Status
  else {
    inferredIntent = "General Infrastructure Health Overview";
    tasks.push(createTaskFromCapability(1, "vercel.production_health", {}, confirmedByFounder));
    tasks.push(createTaskFromCapability(2, "aws.ec2_status", {}, confirmedByFounder));
  }

  const confirmationPrompts = tasks
    .filter((t) => t.requiresConfirmation && t.confirmationPrompt)
    .map((t) => t.confirmationPrompt as string);

  return {
    rawQuery: query,
    inferredIntent,
    tasks,
    requiresFounderConfirmation: confirmationPrompts.length > 0,
    confirmationPrompts,
    tenantScope,
    companyScope,
    evaluatedAt: new Date().toISOString(),
  };
}
