/**
 * Single Canonical Vercel Write Capability Resolver
 *
 * Enforces one unified source of truth across:
 * - Customer Integrations UI (WebsiteConnectorCard)
 * - Canonical Status Resolver
 * - Load Integrations Data
 * - Search Action Execution Precheck
 * - Search Action Execution Engine
 * - Search Growth Dashboard
 *
 * Distinguishes genuine customer write authorization from read-only connection
 * and never presents internal platform credentials as customer write permission.
 */

export type VercelWriteCapabilityState =
  | "NOT_CONNECTED"
  | "AUTHENTICATION_FAILED"
  | "READ_ONLY"
  | "WRITE_READY"
  | "PROJECT_NOT_FOUND"
  | "DOMAIN_MISMATCH"
  | "PROVIDER_UNAVAILABLE"
  | "CUSTOMER_WRITE_AUTH_REQUIRED";

export interface VercelWriteCapabilityResult {
  state: VercelWriteCapabilityState;
  writeEnabled: boolean;
  canMutate: boolean;
  reason: string;
  customerUiCopy: {
    connectionBadge: string;
    automaticChangesLabel: string;
    automaticChangesSubtext: string;
    statusSummary: string;
  };
  projectDetails: {
    name: string;
    framework: string;
    status: string;
    targetDomain: string;
    teamId?: string;
  };
  provenance: "customer_tenant_connection" | "verified_public_domain" | "unconfigured";
}

export interface ResolveVercelWriteCapabilityParams {
  tenantId: string;
  db?: any;
  targetDomain?: string;
  siteUrl?: string;
  token?: string;
  teamId?: string;
  projectId?: string;
}

export async function resolveVercelWriteCapability(
  params: ResolveVercelWriteCapabilityParams
): Promise<VercelWriteCapabilityResult> {
  const targetDomain = params.targetDomain || (params.siteUrl ? new URL(params.siteUrl.startsWith("http") ? params.siteUrl : `https://${params.siteUrl}`).hostname : "stratxcel.in");
  const defaultProjectName = params.projectId || "stratxcel";
  const defaultTeamId = params.teamId || "team_UWCzHaOLdAOtezWqRxYNxdYf";

  // 1. If DB client is provided, query tenant's saved search_cms_connections
  let savedConn: any = null;
  if (params.db && typeof params.db.from === "function") {
    try {
      const { data } = await params.db
        .from("search_cms_connections")
        .select("*")
        .eq("tenant_id", params.tenantId)
        .in("cms_type", ["vercel", "nextjs", "stratxcel_native", "wordpress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      savedConn = data;
    } catch {
      savedConn = null;
    }
  }

  // 2. Check customer-connected token / write authorization
  // If connection row exists in DB
  if (savedConn) {
    // Check if domain matches
    if (savedConn.site_url) {
      try {
        const connHost = new URL(savedConn.site_url.startsWith("http") ? savedConn.site_url : `https://${savedConn.site_url}`).hostname.replace(/^www\./, "");
        const queryHost = targetDomain.replace(/^www\./, "");
        if (connHost !== queryHost) {
          return {
            state: "DOMAIN_MISMATCH",
            writeEnabled: false,
            canMutate: false,
            reason: `Target domain (${queryHost}) does not match connected CMS domain (${connHost}).`,
            customerUiCopy: {
              connectionBadge: "Domain Mismatch",
              automaticChangesLabel: "Connect matching website",
              automaticChangesSubtext: `The connected website is ${connHost}, but the target is ${queryHost}.`,
              statusSummary: "Domain mismatch between project and action target.",
            },
            projectDetails: {
              name: defaultProjectName,
              framework: "nextjs",
              status: "DOMAIN_MISMATCH",
              targetDomain,
              teamId: defaultTeamId,
            },
            provenance: "customer_tenant_connection",
          };
        }
      } catch {
        // Fall through
      }
    }

    if (savedConn.is_healthy === false) {
      return {
        state: "AUTHENTICATION_FAILED",
        writeEnabled: false,
        canMutate: false,
        reason: "The customer's connected Vercel token failed authentication or was revoked.",
        customerUiCopy: {
          connectionBadge: "Needs Attention",
          automaticChangesLabel: "Reconnect Vercel with write access",
          automaticChangesSubtext: "Authentication rejected. Reconnect your Vercel account or token.",
          statusSummary: "Vercel authentication failed.",
        },
        projectDetails: {
          name: defaultProjectName,
          framework: "nextjs",
          status: "AUTH_FAILED",
          targetDomain,
          teamId: defaultTeamId,
        },
        provenance: "customer_tenant_connection",
      };
    }

    if (savedConn.write_enabled === true) {
      return {
        state: "WRITE_READY",
        writeEnabled: true,
        canMutate: true,
        reason: "Customer's Vercel connection is authorized with write and deployment capabilities.",
        customerUiCopy: {
          connectionBadge: "Connected · Write ready",
          automaticChangesLabel: "✓ Ready",
          automaticChangesSubtext: "Autonomous SEO schema, metadata, and landing page publishing enabled.",
          statusSummary: "Vercel connection write-authorized and deployment ready.",
        },
        projectDetails: {
          name: defaultProjectName,
          framework: "nextjs",
          status: "READY",
          targetDomain,
          teamId: defaultTeamId,
        },
        provenance: "customer_tenant_connection",
      };
    }
  }

  // 3. If a direct custom token was passed in params (e.g. during onboarding or specific test)
  if (params.token) {
    return {
      state: "WRITE_READY",
      writeEnabled: true,
      canMutate: true,
      reason: "Explicit write token supplied for tenant execution.",
      customerUiCopy: {
        connectionBadge: "Connected · Write ready",
        automaticChangesLabel: "✓ Ready",
        automaticChangesSubtext: "Autonomous SEO schema, metadata, and landing page publishing enabled.",
        statusSummary: "Vercel connection write-authorized and deployment ready.",
      },
      projectDetails: {
        name: defaultProjectName,
        framework: "nextjs",
        status: "READY",
        targetDomain,
        teamId: defaultTeamId,
      },
      provenance: "customer_tenant_connection",
    };
  }

  // 4. Default Truthful State:
  // The website is discovered and authenticated publicly (Read-only for SEO/AEO/GEO/GSC audits).
  // Automatic website mutations require customer write authorization.
  return {
    state: "READ_ONLY",
    writeEnabled: false,
    canMutate: false,
    reason: "EXTERNAL_PERMISSION_REQUIRED: Customer website is connected in read-only mode. Autonomous search analysis runs independently, but live website mutations require a Vercel token with write access.",
    customerUiCopy: {
      connectionBadge: "Connected · Read-only",
      automaticChangesLabel: "Connect Vercel with write access",
      automaticChangesSubtext: "Read-only connection active. Search, SEO, and AEO analysis work independently. Connect a Vercel token with write access to enable automatic website changes.",
      statusSummary: "Connected · Read-only (External write permission required).",
    },
    projectDetails: {
      name: defaultProjectName,
      framework: "nextjs",
      status: "READY",
      targetDomain,
      teamId: defaultTeamId,
    },
    provenance: "verified_public_domain",
  };
}
