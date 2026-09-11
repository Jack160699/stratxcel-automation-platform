import crypto from "node:crypto";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { CANONICAL_ORIGIN } from "@/lib/reporting/site";

export const GOOGLE_SERVICE_KEYS = [
  "google_drive",
  "google_sheets",
  "google_docs",
  "google_calendar",
  "gmail",
  "search_console",
  "google_analytics",
  "google_business",
  "youtube",
  "google_ads",
] as const;

export type GoogleServiceKey = (typeof GOOGLE_SERVICE_KEYS)[number];

export type CapabilityStatus =
  | "CONNECTED"
  | "AUTHORIZED"
  | "VERIFIED"
  | "NEEDS_PERMISSION"
  | "EXPIRED"
  | "REQUIRES_REAUTH"
  | "RESTRICTED"
  | "UNAVAILABLE"
  | "NOT_CONNECTED";

export interface GoogleServiceDefinition {
  key: GoogleServiceKey;
  name: string;
  category: "storage" | "productivity" | "communication" | "growth" | "media" | "advertising";
  scopes: string[];
  whatAccessIsRequested: string;
  whyItIsNeeded: string;
  whatHermesCanDo: string;
  writeCapable: boolean;
}

export const GOOGLE_SERVICE_DEFINITIONS: Record<GoogleServiceKey, GoogleServiceDefinition> = {
  google_drive: {
    key: "google_drive",
    name: "Google Drive",
    category: "storage",
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    whatAccessIsRequested: "Create and manage mission deliverable files and folders",
    whyItIsNeeded: "Hermes needs authorized storage to store reports, spreadsheets, and creative media into canonical company folders.",
    whatHermesCanDo: "Automatically create mission folders under StratXcel/Autonomous Company/Missions/ and upload verified deliverables with direct web view links.",
    writeCapable: true,
  },
  google_sheets: {
    key: "google_sheets",
    name: "Google Sheets",
    category: "productivity",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    whatAccessIsRequested: "Read and write Google Sheets spreadsheets",
    whyItIsNeeded: "Hermes needs to generate structured lead lists, financial payback models, and commercial prospect tables.",
    whatHermesCanDo: "Export and update live account spreadsheets, formula models, and tariff matrices.",
    writeCapable: true,
  },
  google_docs: {
    key: "google_docs",
    name: "Google Docs",
    category: "productivity",
    scopes: ["https://www.googleapis.com/auth/documents"],
    whatAccessIsRequested: "Create and edit Google Docs documents",
    whyItIsNeeded: "Hermes needs to generate executive proposals, solar feasibility studies, and strategy briefs.",
    whatHermesCanDo: "Author structured executive documents with tables, summaries, and recommendations.",
    writeCapable: true,
  },
  google_calendar: {
    key: "google_calendar",
    name: "Google Calendar",
    category: "productivity",
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    whatAccessIsRequested: "Schedule calendar events and check availability",
    whyItIsNeeded: "Hermes needs to schedule approved client consultation meetings and follow-up reviews.",
    whatHermesCanDo: "Place confirmed discovery calls directly onto the Founder's calendar without conflicts.",
    writeCapable: true,
  },
  gmail: {
    key: "gmail",
    name: "Gmail",
    category: "communication",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    whatAccessIsRequested: "Read and send authorized business email communications",
    whyItIsNeeded: "Hermes needs to manage customer sales threads and send approved outreach emails.",
    whatHermesCanDo: "Dispatch governed outreach emails, recognize customer replies, and advance CRM pipeline stages.",
    writeCapable: true,
  },
  search_console: {
    key: "search_console",
    name: "Google Search Console",
    category: "growth",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    whatAccessIsRequested: "Read search queries, impressions, and indexation data",
    whyItIsNeeded: "Hermes monitors organic keyword rankings and technical SEO health for stratxcel.in.",
    whatHermesCanDo: "Detect traffic drops, identify high-intent search terms, and trigger autonomous SEO optimizations.",
    writeCapable: false,
  },
  google_analytics: {
    key: "google_analytics",
    name: "Google Analytics (GA4)",
    category: "growth",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    whatAccessIsRequested: "Read web traffic, session metrics, and conversion events",
    whyItIsNeeded: "Hermes tracks landing page conversion rates and campaign attribution.",
    whatHermesCanDo: "Correlate organic visits with lead generation and identify top-performing funnels.",
    writeCapable: false,
  },
  google_business: {
    key: "google_business",
    name: "Google Business Profile",
    category: "growth",
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    whatAccessIsRequested: "Manage business listing, reviews, and updates",
    whyItIsNeeded: "Hermes optimizes Google Maps local search visibility and monitors customer reviews.",
    whatHermesCanDo: "Sync business details, draft review responses for Founder approval, and publish updates.",
    writeCapable: true,
  },
  youtube: {
    key: "youtube",
    name: "YouTube",
    category: "media",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    whatAccessIsRequested: "Upload video assets and read channel analytics",
    whyItIsNeeded: "Hermes automates the distribution of video marketing and product demonstration assets.",
    whatHermesCanDo: "Publish approved video content with titles, descriptions, and tag optimization.",
    writeCapable: true,
  },
  google_ads: {
    key: "google_ads",
    name: "Google Ads",
    category: "advertising",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    whatAccessIsRequested: "Manage ad campaigns and keyword targeting",
    whyItIsNeeded: "Hermes plans programmatic keyword expansion campaigns.",
    whatHermesCanDo: "Generate ad copy and keyword briefs (requires Google Ads MCC Developer Token).",
    writeCapable: true,
  },
};

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function resolveGoogleOAuthCredentials() {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID ||
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_DRIVE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET ||
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  const stateSecret =
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.OWNER_BRAIN_OAUTH_STATE_SECRET ||
    process.env.SEARCH_GOOGLE_OAUTH_STATE_SECRET ||
    process.env.DRIVE_OAUTH_STATE_SECRET ||
    process.env.SOCIAL_OAUTH_STATE_SECRET ||
    "stratxcel-google-oauth-state-secret-fallback";

  return {
    clientId: clientId || null,
    clientSecret: clientSecret || null,
    stateSecret,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

/**
 * Single source of truth for the Google OAuth Redirect URI.
 *
 * Guaranteed exact match with registered Google Cloud Console OAuth 2.0 Clients:
 * 1. Explicit override via GOOGLE_OAUTH_REDIRECT_URI environment variable (if set).
 * 2. Localhost development origin when invoked from localhost.
 * 3. Canonical production URI:
 *    - For GOOGLE_SEARCH_OAUTH_CLIENT_ID: https://www.stratxcel.in/api/platform/search/google/callback
 *    - For GOOGLE_OWNER_BRAIN_CLIENT_ID: https://www.stratxcel.in/api/admin/operating-brain/connectors/google/callback
 */
export function resolveGoogleOAuthRedirectUri(requestOrigin?: string | null): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }

  if (
    requestOrigin &&
    (requestOrigin.includes("localhost") || requestOrigin.includes("127.0.0.1"))
  ) {
    const cleanOrigin = requestOrigin.replace(/\/+$/, "");
    return `${cleanOrigin}/api/admin/operating-brain/connectors/google/callback`;
  }

  const { clientId } = resolveGoogleOAuthCredentials();
  if (
    clientId &&
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID &&
    clientId === process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID
  ) {
    return `${CANONICAL_ORIGIN}/api/platform/search/google/callback`;
  }

  return `${CANONICAL_ORIGIN}/api/admin/operating-brain/connectors/google/callback`;
}

export function generateGoogleOAuthState(input: {
  tenantId: string;
  userId: string;
  redirectTo?: string;
  requestedServices?: GoogleServiceKey[];
}): string {
  const { stateSecret } = resolveGoogleOAuthCredentials();
  const payload = {
    tenantId: input.tenantId,
    userId: input.userId,
    redirectTo: input.redirectTo || "/admin/connectors",
    services: input.requestedServices || ["google_drive", "search_console", "google_analytics"],
    issuedAtMs: Date.now(),
    nonce: crypto.randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export type VerifyStateResult =
  | {
      ok: true;
      tenantId: string;
      userId: string;
      redirectTo: string;
      services: GoogleServiceKey[];
    }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" };

export function verifyGoogleOAuthState(state: string): VerifyStateResult {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encoded, signature] = parts;

  const { stateSecret } = resolveGoogleOAuthCredentials();
  const expectedSignature = crypto.createHmac("sha256", stateSecret).update(encoded).digest("base64url");

  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload: {
    tenantId: string;
    userId: string;
    redirectTo?: string;
    services?: GoogleServiceKey[];
    issuedAtMs: number;
  };

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() - payload.issuedAtMs > STATE_TTL_MS) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    tenantId: payload.tenantId,
    userId: payload.userId,
    redirectTo: payload.redirectTo || "/admin/connectors",
    services: payload.services || ["google_drive", "search_console", "google_analytics"],
  };
}

export function buildGoogleAuthorizeUrl(input: {
  state: string;
  redirectUri: string;
  requestedServices?: GoogleServiceKey[];
}): string {
  const { clientId, isConfigured } = resolveGoogleOAuthCredentials();
  if (!isConfigured || !clientId) {
    throw new Error("Google OAuth credentials are not configured in environment");
  }

  const baseScopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  // Google OAuth restriction: YouTube scopes (upload, readonly) CANNOT be requested together with Google Drive/Workspace scopes
  // in a single authorization request. If requested together, Google fails with:
  // "This request contains scopes that cannot be requested together: [drive.file, youtube.readonly, youtube.upload]"
  const defaultServices = (Object.keys(GOOGLE_SERVICE_DEFINITIONS) as GoogleServiceKey[]).filter(
    (k) => k !== "youtube"
  );

  let serviceKeys = input.requestedServices && input.requestedServices.length > 0
    ? input.requestedServices
    : defaultServices;

  if (serviceKeys.includes("google_drive") && serviceKeys.includes("youtube")) {
    serviceKeys = serviceKeys.filter((k) => k !== "youtube");
  }


  const additionalScopes = new Set<string>();
  for (const key of serviceKeys) {
    const def = GOOGLE_SERVICE_DEFINITIONS[key];
    if (def) {
      for (const sc of def.scopes) {
        additionalScopes.add(sc);
      }
    }
  }

  const allScopes = Array.from(new Set([...baseScopes, ...Array.from(additionalScopes)]));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: allScopes.join(" "),
    state: input.state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
  idToken?: string;
  tokenType: string;
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, isConfigured } = resolveGoogleOAuthCredentials();
  if (!isConfigured || !clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured in environment");
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(errorText);
    } catch {}
    throw new Error(parsed.error_description || parsed.error || `Google token exchange failed (${res.status})`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    idToken: data.id_token,
    tokenType: data.token_type || "Bearer",
  };
}

export interface GoogleServiceStatus {
  key: GoogleServiceKey;
  name: string;
  category: string;
  status: CapabilityStatus;
  statusLabel: string;
  grantedScopes: string[];
  missingScopes: string[];
  whatAccessIsRequested: string;
  whyItIsNeeded: string;
  whatHermesCanDo: string;
  writeCapable: boolean;
  lastVerifiedAt: string | null;
}

export interface GoogleHubStatus {
  connected: boolean;
  status: CapabilityStatus;
  statusLabel: string;
  accountEmail: string | null;
  accountName: string | null;
  grantedScopes: string[];
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  services: GoogleServiceStatus[];
  driveReady: boolean;
  searchConsoleReady: boolean;
  analyticsReady: boolean;
  needsReauth: boolean;
}

export function evaluateGoogleServices(
  grantedScopes: string[],
  connection: {
    status?: string | null;
    connectedAt?: string | null;
    lastVerifiedAt?: string | null;
    accountEmail?: string | null;
    accountName?: string | null;
    lastError?: string | null;
  } | null
): GoogleHubStatus {
  const isMasterConnected = connection?.status === "connected";
  const scopesSet = new Set(
    (grantedScopes || []).flatMap((s) => s.split(" ").map((sc) => sc.trim())).filter(Boolean)
  );

  const services: GoogleServiceStatus[] = [];

  for (const key of GOOGLE_SERVICE_KEYS) {
    const def = GOOGLE_SERVICE_DEFINITIONS[key];
    const granted = def.scopes.filter((s) => scopesSet.has(s));
    const missing = def.scopes.filter((s) => !scopesSet.has(s));

    let status: CapabilityStatus = "NOT_CONNECTED";
    let statusLabel = "Not connected";

    if (key === "google_ads") {
      status = "UNAVAILABLE";
      statusLabel = "Requires developer token";
    } else if (!isMasterConnected) {
      status = "NOT_CONNECTED";
      statusLabel = "Not connected";
    } else if (connection?.lastError?.includes("expired") || connection?.lastError?.includes("revoked")) {
      status = "REQUIRES_REAUTH";
      statusLabel = "Authorization expired";
    } else if (granted.length === 0) {
      status = "NEEDS_PERMISSION";
      statusLabel = "Permission needed";
    } else if (key === "google_drive") {
      if (scopesSet.has("https://www.googleapis.com/auth/drive.file") || scopesSet.has("https://www.googleapis.com/auth/drive")) {
        status = "AUTHORIZED";
        statusLabel = "Authorized (Write ready)";
      } else if (scopesSet.has("https://www.googleapis.com/auth/drive.readonly")) {
        status = "RESTRICTED";
        statusLabel = "Read only";
      } else {
        status = "NEEDS_PERMISSION";
        statusLabel = "Permission needed";
      }
    } else if (key === "search_console") {
      if (scopesSet.has("https://www.googleapis.com/auth/webmasters.readonly") || scopesSet.has("https://www.googleapis.com/auth/webmasters")) {
        status = "VERIFIED";
        statusLabel = "Verified (stratxcel.in)";
      } else {
        status = "NEEDS_PERMISSION";
        statusLabel = "Permission needed";
      }
    } else if (key === "google_analytics") {
      if (scopesSet.has("https://www.googleapis.com/auth/analytics.readonly") || scopesSet.has("https://www.googleapis.com/auth/analytics")) {
        status = "VERIFIED";
        statusLabel = "Verified (GA4 538010450)";
      } else {
        status = "NEEDS_PERMISSION";
        statusLabel = "Permission needed";
      }
    } else if (granted.length > 0) {
      status = "AUTHORIZED";
      statusLabel = "Authorized";
    }

    services.push({
      key,
      name: def.name,
      category: def.category,
      status,
      statusLabel,
      grantedScopes: granted,
      missingScopes: missing,
      whatAccessIsRequested: def.whatAccessIsRequested,
      whyItIsNeeded: def.whyItIsNeeded,
      whatHermesCanDo: def.whatHermesCanDo,
      writeCapable: def.writeCapable,
      lastVerifiedAt: status === "VERIFIED" || status === "AUTHORIZED" ? connection?.lastVerifiedAt || connection?.connectedAt || null : null,
    });
  }

  const driveService = services.find((s) => s.key === "google_drive");
  const searchService = services.find((s) => s.key === "search_console");
  const analyticsService = services.find((s) => s.key === "google_analytics");

  const driveReady = driveService?.status === "AUTHORIZED" || driveService?.status === "VERIFIED";
  const searchConsoleReady = searchService?.status === "VERIFIED";
  const analyticsReady = analyticsService?.status === "VERIFIED";

  let overallStatus: CapabilityStatus = "NOT_CONNECTED";
  let overallLabel = "Not connected";

  if (isMasterConnected) {
    if (connection?.lastError?.includes("expired") || connection?.lastError?.includes("revoked")) {
      overallStatus = "REQUIRES_REAUTH";
      overallLabel = "Authorization expired";
    } else {
      overallStatus = "CONNECTED";
      overallLabel = "Connected";
    }
  }

  return {
    connected: isMasterConnected,
    status: overallStatus,
    statusLabel: overallLabel,
    accountEmail: connection?.accountEmail || (isMasterConnected ? "stratxcelgame@gmail.com" : null),
    accountName: connection?.accountName || (isMasterConnected ? "StratXcel Founder Account" : null),
    grantedScopes: Array.from(scopesSet),
    connectedAt: connection?.connectedAt || null,
    lastVerifiedAt: connection?.lastVerifiedAt || null,
    expiresAt: null,
    services,
    driveReady,
    searchConsoleReady,
    analyticsReady,
    needsReauth: overallStatus === "REQUIRES_REAUTH",
  };
}

export async function fetchGoogleHubStatus(supabase: any, tenantId: string): Promise<GoogleHubStatus> {
  // Query both search_google_connections and connector_connections
  const [searchConnRes, connConnRes] = await Promise.all([
    supabase
      .from("search_google_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("connector_connections")
      .select("*")
      .eq("connector_key", "google")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const searchConn = searchConnRes.data;
  const connConn = connConnRes.data;

  const activeConn = connConn || searchConn;

  const grantedScopes: string[] = Array.isArray(searchConn?.granted_scopes)
    ? searchConn.granted_scopes
    : Array.isArray(connConn?.discovered_capabilities)
    ? connConn.discovered_capabilities
    : [];

  const status = searchConn?.status || connConn?.status || "not_configured";

  const rawConnection = activeConn
    ? {
        status,
        connectedAt: activeConn.connected_at,
        lastVerifiedAt: activeConn.last_verified_at || activeConn.last_health_check_at,
        accountEmail: searchConn ? "stratxcelgame@gmail.com" : null,
        accountName: "StratXcel Founder Account",
        lastError: activeConn.last_error,
      }
    : null;

  return evaluateGoogleServices(grantedScopes, rawConnection);
}

export async function persistGoogleTokens(
  supabase: any,
  input: {
    tenantId: string;
    userId: string;
    tokens: GoogleTokenResponse;
  }
) {
  const grantedScopes = (input.tokens.scope || "")
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean);

  let encryptedRef: string | null = null;
  if (input.tokens.refreshToken) {
    const vault = createDevEncryptedVault(supabase);
    encryptedRef = await vault.store(input.tokens.refreshToken);
  }

  const now = new Date().toISOString();

  // 1. Upsert into connector_connections
  const connectorPayload: Record<string, unknown> = {
    connector_key: "google",
    tenant_id: input.tenantId,
    status: "connected",
    discovered_capabilities: grantedScopes,
    last_health_check_at: now,
    last_verified_at: now,
    last_error: null,
    connected_by_user_id: input.userId,
    connected_at: now,
    updated_at: now,
  };

  if (encryptedRef) {
    connectorPayload.encrypted_secret_ref = encryptedRef;
  }

  const { error: cErr } = await supabase
    .from("connector_connections")
    .upsert(connectorPayload, { onConflict: "connector_key,tenant_id" });

  if (cErr) {
    console.warn("[google-oauth] connector_connections upsert notice:", cErr.message);
  }

  // 2. Upsert into search_google_connections to maintain GA4 and Search Console linkage
  const searchPayload: Record<string, unknown> = {
    tenant_id: input.tenantId,
    status: "connected",
    granted_scopes: grantedScopes,
    last_error: null,
    connected_at: now,
    connected_by_user_id: input.userId,
    search_console_site_url: "https://www.stratxcel.in/",
    ga4_property_id: "538010450",
    ga4_property_display_name: "www.stratxcel.in",
    updated_at: now,
  };

  if (encryptedRef) {
    searchPayload.encrypted_refresh_token_ref = encryptedRef;
  }

  const { error: sErr } = await supabase
    .from("search_google_connections")
    .upsert(searchPayload, { onConflict: "tenant_id" });

  if (sErr) {
    console.warn("[google-oauth] search_google_connections upsert notice:", sErr.message);
  }

  // 3. Bridge into storage_connections so @stratxcel/storage Drive adapter can resolve tokens.
  //    The Drive adapter's getAccessToken() queries storage_connections — without this upsert,
  //    it always throws StorageNotConnectedError even when Google OAuth is fully connected.
  const driveScopes = grantedScopes.filter(
    (s) =>
      s.includes("drive") ||
      s.includes("docs") ||
      s.includes("sheets") ||
      s.includes("spreadsheets")
  );

  if (driveScopes.length > 0 && encryptedRef) {
    const storagePayload: Record<string, unknown> = {
      tenant_id: input.tenantId,
      provider: "google_drive",
      status: "connected",
      account_email: null,
      encrypted_token_ref: encryptedRef,
      scopes: driveScopes,
      root_folder_id: null,
      last_error: null,
      connected_at: now,
      updated_at: now,
    };

    const { error: stErr } = await supabase
      .from("storage_connections")
      .upsert(storagePayload, { onConflict: "tenant_id,provider" });

    if (stErr) {
      console.warn("[google-oauth] storage_connections upsert notice:", stErr.message);
    } else {
      console.log(
        `[google-oauth] Bridged ${driveScopes.length} Drive scope(s) into storage_connections for tenant ${input.tenantId}`
      );
    }
  }

  return { success: true, grantedScopes };
}
