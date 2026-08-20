/**
 * Production Configuration Validator & Environment Safety Gate
 *
 * Enforces fail-closed validation for the AI Website Factory across all environments:
 *   - DEVELOPMENT
 *   - SANDBOX
 *   - STAGING
 *   - PRODUCTION
 *
 * Ensures:
 * 1. Required production credentials are present before enabling live operations.
 * 2. Accidental live domain purchases or deployments are prevented unless
 *    explicitly opted-in via ALLOW_LIVE_DOMAIN_PURCHASES=true and ALLOW_LIVE_HOSTING_DEPLOYMENTS=true.
 * 3. Sandbox mode is never quietly substituted when production is expected.
 * 4. Secrets are NEVER logged or leaked.
 */

export type AppEnvironment = "development" | "sandbox" | "staging" | "production";

export interface ProductionGateReport {
  environment: AppEnvironment;
  readyForLiveOperations: boolean;
  allowLiveDomainPurchases: boolean;
  allowLiveHostingDeployments: boolean;
  domainRegistrarConfigured: boolean;
  hostingProviderConfigured: boolean;
  aiProviderConfigured: boolean;
  razorpayConfigured: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Resolves the canonical deployment environment.
 */
export function resolveAppEnvironment(envObj: Record<string, string | undefined> = process.env): AppEnvironment {
  const env = (envObj.APP_ENV || envObj.NODE_ENV || "development").toLowerCase().trim();
  if (env === "production" || env === "prod") return "production";
  if (env === "staging" || env === "stage") return "staging";
  if (env === "sandbox") return "sandbox";
  return "development";
}

/**
 * Validates production environment variables and safety gates.
 * Never logs or returns secret values.
 */
export function validateProductionGate(envObj: Record<string, string | undefined> = process.env): ProductionGateReport {
  const environment = resolveAppEnvironment(envObj);
  const errors: string[] = [];
  const warnings: string[] = [];

  const isProduction = environment === "production";
  const allowLiveDomainPurchases = envObj.ALLOW_LIVE_DOMAIN_PURCHASES === "true";
  const allowLiveHostingDeployments = envObj.ALLOW_LIVE_HOSTING_DEPLOYMENTS === "true";

  // 1. Domain Registrar Gate
  const registrarMode = envObj.DOMAIN_REGISTRAR_MODE || (isProduction ? "disabled" : "sandbox");
  const hasRegistrarKey = Boolean(envObj.DOMAIN_REGISTRAR_API_KEY?.trim());
  const hasRegistrarSecret = Boolean(envObj.DOMAIN_REGISTRAR_API_SECRET?.trim());

  let domainRegistrarConfigured = false;
  if (registrarMode === "live") {
    if (!hasRegistrarKey || !hasRegistrarSecret) {
      errors.push("DOMAIN_REGISTRAR_MODE is 'live' but DOMAIN_REGISTRAR_API_KEY or DOMAIN_REGISTRAR_API_SECRET is missing.");
    } else if (!allowLiveDomainPurchases) {
      errors.push("DOMAIN_REGISTRAR_MODE is 'live' but ALLOW_LIVE_DOMAIN_PURCHASES=true is missing. Live purchases remain locked for safety.");
    } else {
      domainRegistrarConfigured = true;
    }
  } else if (isProduction) {
    errors.push(`In production, DOMAIN_REGISTRAR_MODE must be 'live' with valid credentials and ALLOW_LIVE_DOMAIN_PURCHASES=true (currently '${registrarMode}').`);
  } else {
    warnings.push(`Non-production environment '${environment}' running with DOMAIN_REGISTRAR_MODE='${registrarMode}'.`);
  }

  // 2. Hosting & Vercel Gate
  const hostingMode = envObj.HOSTING_PROVIDER_MODE || (isProduction ? "disabled" : "sandbox");
  const hasVercelToken = Boolean(envObj.VERCEL_AUTH_TOKEN?.trim());
  const hasVercelProject = Boolean(envObj.VERCEL_PROJECT_ID?.trim());

  let hostingProviderConfigured = false;
  if (hostingMode === "live") {
    if (!hasVercelToken || !hasVercelProject) {
      errors.push("HOSTING_PROVIDER_MODE is 'live' but VERCEL_AUTH_TOKEN or VERCEL_PROJECT_ID is missing.");
    } else if (!allowLiveHostingDeployments) {
      errors.push("HOSTING_PROVIDER_MODE is 'live' but ALLOW_LIVE_HOSTING_DEPLOYMENTS=true is missing. Live deployments remain locked for safety.");
    } else {
      hostingProviderConfigured = true;
    }
  } else if (isProduction) {
    errors.push(`In production, HOSTING_PROVIDER_MODE must be 'live' with VERCEL_AUTH_TOKEN, VERCEL_PROJECT_ID, and ALLOW_LIVE_HOSTING_DEPLOYMENTS=true (currently '${hostingMode}').`);
  } else {
    warnings.push(`Non-production environment '${environment}' running with HOSTING_PROVIDER_MODE='${hostingMode}'.`);
  }

  // 3. AI Provider Gate
  const hasGeminiKey = Boolean(envObj.GEMINI_API_KEY?.trim() || envObj.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  let aiProviderConfigured = false;
  if (!hasGeminiKey) {
    if (isProduction) {
      errors.push("GEMINI_API_KEY is required in production for AI website generation.");
    } else {
      warnings.push("GEMINI_API_KEY missing — AI generation will fail or use mock mode.");
    }
  } else {
    aiProviderConfigured = true;
  }

  // 4. Razorpay Gate
  const hasRazorpayKey = Boolean(envObj.RAZORPAY_KEY_ID?.trim());
  const hasRazorpaySecret = Boolean(envObj.RAZORPAY_KEY_SECRET?.trim());
  const hasRazorpayWebhook = Boolean(envObj.RAZORPAY_WEBHOOK_SECRET?.trim());
  let razorpayConfigured = false;

  if (isProduction) {
    if (!hasRazorpayKey || !hasRazorpaySecret || !hasRazorpayWebhook) {
      errors.push("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET are all required in production.");
    } else {
      razorpayConfigured = true;
    }
  } else {
    if (!hasRazorpayWebhook) {
      warnings.push("RAZORPAY_WEBHOOK_SECRET missing in development — payment webhook verification will fail.");
    } else {
      razorpayConfigured = true;
    }
  }

  const readyForLiveOperations =
    errors.length === 0 &&
    domainRegistrarConfigured &&
    hostingProviderConfigured &&
    aiProviderConfigured &&
    razorpayConfigured;

  return {
    environment,
    readyForLiveOperations,
    allowLiveDomainPurchases,
    allowLiveHostingDeployments,
    domainRegistrarConfigured,
    hostingProviderConfigured,
    aiProviderConfigured,
    razorpayConfigured,
    errors,
    warnings,
  };
}

/**
 * Gate check for domain purchase execution.
 * Throws explicit, safe errors if live purchase is attempted without full authorization.
 */
export function assertDomainPurchaseAllowed(
  requestedMode: "live" | "sandbox" | "disabled",
  envObj: Record<string, string | undefined> = process.env
): void {
  if (requestedMode === "disabled") {
    throw new Error("Domain registration is currently disabled.");
  }

  if (requestedMode === "live") {
    if (envObj.ALLOW_LIVE_DOMAIN_PURCHASES !== "true") {
      throw new Error(
        "Live domain purchase rejected by safety gate: ALLOW_LIVE_DOMAIN_PURCHASES=true is required."
      );
    }
    if (!envObj.DOMAIN_REGISTRAR_API_KEY?.trim() || !envObj.DOMAIN_REGISTRAR_API_SECRET?.trim()) {
      throw new Error("Live domain purchase rejected: Registrar provider credentials not configured.");
    }
  }
}

/**
 * Gate check for custom domain hosting deployment.
 * Throws explicit, safe errors if live deployment is attempted without full authorization.
 */
export function assertLiveHostingDeploymentAllowed(
  requestedMode: "live" | "sandbox" | "disabled",
  envObj: Record<string, string | undefined> = process.env
): void {
  if (requestedMode === "disabled") {
    throw new Error("Hosting deployment is currently disabled.");
  }

  if (requestedMode === "live") {
    if (envObj.ALLOW_LIVE_HOSTING_DEPLOYMENTS !== "true") {
      throw new Error(
        "Live hosting deployment rejected by safety gate: ALLOW_LIVE_HOSTING_DEPLOYMENTS=true is required."
      );
    }
    if (!envObj.VERCEL_AUTH_TOKEN?.trim() || !envObj.VERCEL_PROJECT_ID?.trim()) {
      throw new Error("Live hosting deployment rejected: Vercel provider credentials not configured.");
    }
  }
}
