/**
 * Safe Secret & Credential Reference Model for MCP Infrastructure
 * Resolves authentication without storing raw tokens or secrets in config files.
 */

export type SecretLocationType =
  | "ENVIRONMENT"
  | "ADMIN_VAULT"
  | "OAUTH_SESSION"
  | "CLI_PROFILE"
  | "BROWSER_SESSION"
  | "NONE";

export interface SecretReferenceDescriptor {
  mcpId: string;
  locationType: SecretLocationType;
  referenceKey: string;
  isAvailable: boolean;
  safeIdentifier: string;
  description: string;
}

/**
 * Resolves safe credential references for an MCP server in the current runtime.
 * Never returns or logs actual credential values.
 */
export function resolveMcpSecretReference(
  mcpId: string,
  envVars: Record<string, string | undefined> = process.env
): SecretReferenceDescriptor {
  switch (mcpId) {
    case "stratxcel-github": {
      const hasToken = Boolean(
        envVars.GITHUB_PERSONAL_ACCESS_TOKEN || envVars.GITHUB_TOKEN
      );
      return {
        mcpId,
        locationType: "ENVIRONMENT",
        referenceKey: "GITHUB_PERSONAL_ACCESS_TOKEN",
        isAvailable: hasToken,
        safeIdentifier: hasToken ? "ghp_... (configured in environment)" : "missing",
        description: "Resolved from ${GITHUB_TOKEN} or Windows Git Credential Manager",
      };
    }

    case "stratxcel-browser": {
      return {
        mcpId,
        locationType: "BROWSER_SESSION",
        referenceKey: "D:/pw-profile",
        isAvailable: true,
        safeIdentifier: "stratxcelsolutions@gmail.com (Chromium User Profile)",
        description: "Persistent Chromium user profile with stored authentication cookies",
      };
    }

    case "stratxcel-hermes": {
      const hasBridgeSecret = Boolean(envVars.STRATXCEL_MCP_BRIDGE_SECRET);
      return {
        mcpId,
        locationType: "ENVIRONMENT",
        referenceKey: "STRATXCEL_MCP_BRIDGE_SECRET",
        isAvailable: hasBridgeSecret,
        safeIdentifier: hasBridgeSecret ? "bearer-token:configured" : "missing",
        description: "Transport layer HMAC bearer credential in .env.hermes-gateway",
      };
    }

    case "stratxcel-aws":
    case "stratxcel-s3": {
      const hasAwsCreds = Boolean(
        (envVars.AWS_ACCESS_KEY_ID && envVars.AWS_SECRET_ACCESS_KEY) || envVars.AWS_PROFILE
      );
      return {
        mcpId,
        locationType: "CLI_PROFILE",
        referenceKey: "AWS_PROFILE=default",
        isAvailable: hasAwsCreds,
        safeIdentifier: hasAwsCreds ? "arn:aws:iam::257212469831:root" : "unconfigured",
        description: "AWS CLI shared credentials file (~/.aws/credentials) or environment keys",
      };
    }

    case "stratxcel-meta-dev":
    case "stratxcel-whatsapp": {
      const hasToken = Boolean(
        envVars.WHATSAPP_TOKEN || envVars.META_APP_SECRET
      );
      return {
        mcpId,
        locationType: "ADMIN_VAULT",
        referenceKey: "social_tokens",
        isAvailable: hasToken,
        safeIdentifier: hasToken ? "meta-app:1221... (AES-256-GCM encrypted)" : "unconfigured",
        description: "Stored encrypted in Supabase social_tokens or .env.whatsapp-worker",
      };
    }

    case "stratxcel-google-drive": {
      const hasOauth = Boolean(envVars.GOOGLE_REFRESH_TOKEN);
      return {
        mcpId,
        locationType: "OAUTH_SESSION",
        referenceKey: "owner_source_connections",
        isAvailable: hasOauth,
        safeIdentifier: hasOauth ? "oauth-refresh-token:configured" : "unconfigured",
        description: "Stored OAuth refresh token from owner_source_connections",
      };
    }

    case "stratxcel-supabase": {
      const hasDbUrl = Boolean(
        envVars.POSTGRES_CONNECTION_STRING || envVars.SUPABASE_DB_URL
      );
      return {
        mcpId,
        locationType: "ENVIRONMENT",
        referenceKey: "POSTGRES_CONNECTION_STRING",
        isAvailable: hasDbUrl,
        safeIdentifier: hasDbUrl ? "postgres://...@uccqlgeghkwzujeeymua" : "unconfigured",
        description: "Direct PostgreSQL connection URI for Supabase database",
      };
    }

    case "stratxcel-vercel": {
      const hasToken = Boolean(envVars.VERCEL_API_TOKEN);
      return {
        mcpId,
        locationType: "ENVIRONMENT",
        referenceKey: "VERCEL_API_TOKEN",
        isAvailable: hasToken,
        safeIdentifier: hasToken ? "vercel_token:configured" : "unconfigured",
        description: "Vercel API token for deployment status inspection",
      };
    }

    default:
      return {
        mcpId,
        locationType: "NONE",
        referenceKey: "none",
        isAvailable: false,
        safeIdentifier: "none",
        description: "No credential reference configured for this MCP",
      };
  }
}
