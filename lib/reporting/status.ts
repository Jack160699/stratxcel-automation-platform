/**
 * Reporting & analytics connection health.
 *
 * Every state here is derived from something real: an OAuth grant actually
 * stored in social_accounts (its `status`, `token_health` and the exact
 * `permissions` array the provider returned at consent time), or an
 * environment variable that is genuinely present at build/runtime. Nothing is
 * assumed connected, and no timestamp is invented — a provider with no
 * measurement is reported as such rather than as a zero.
 *
 * This mirrors the honesty rule the rest of the product already follows
 * (app/app/reports/page.tsx, app/admin/social/analytics/page.tsx): a missing
 * number is "not available", never a fabricated one.
 *
 * Nothing in the returned shape can carry a credential — only ids, scope
 * names, and enum states are surfaced. Tokens live encrypted in social_tokens
 * and are never read on this path.
 */

export type ReportingProviderId =
  | "vercel_analytics"
  | "google_analytics"
  | "search_console"
  | "youtube"
  | "facebook"
  | "instagram"
  | "threads"
  | "linkedin";

export type ReportingStatusState =
  /** Reporting is authorised and usable right now. */
  | "connected"
  /** Authorised, but nothing has been measured yet — not an error. */
  | "no_data"
  /** No account/credential is connected at all. */
  | "not_connected"
  /** Connected, but the scope this reporting needs was not granted. */
  | "permission_required"
  /** Connected, but the stored credential is unusable (expired/revoked). */
  | "error"
  /** Needs an environment variable that has not been set. */
  | "not_configured";

export interface ReportingProviderStatus {
  provider: ReportingProviderId;
  displayName: string;
  connected: boolean;
  status: ReportingStatusState;
  /** Last time the provider connection itself was refreshed. Never invented. */
  lastSyncAt: string | null;
  /** Stable machine-readable reason. Null when `status` is "connected". */
  reason: string | null;
  /** Scopes this provider's reporting needs but does not currently hold. */
  missingScopes: string[];
}

/** The subset of social_accounts this module reads. No token columns. */
export interface SocialAccountRow {
  platform: string | null;
  status: string | null;
  token_health: string | null;
  permissions: string[] | null;
  last_sync_at: string | null;
  updated_at: string | null;
}

/**
 * Scope each provider needs before its *reporting* API will answer. Publishing
 * scopes are deliberately excluded — a connection that can post but cannot
 * read insights is `permission_required`, not `connected`, and naming the
 * exact missing scope is what makes that actionable instead of vague.
 */
const REPORTING_SCOPES: Record<string, { anyOf: string[]; displayName: string }> = {
  youtube: {
    displayName: "YouTube Analytics",
    anyOf: ["https://www.googleapis.com/auth/youtube.readonly"],
  },
  facebook: {
    displayName: "Facebook Page Insights",
    anyOf: ["read_insights", "pages_read_engagement"],
  },
  instagram: {
    displayName: "Instagram Insights",
    anyOf: ["instagram_business_manage_insights"],
  },
  threads: {
    displayName: "Threads Insights",
    anyOf: ["threads_manage_insights"],
  },
  linkedin: {
    displayName: "LinkedIn Analytics",
    anyOf: ["r_organization_social", "rw_organization_admin"],
  },
};

const SOCIAL_PROVIDERS: ReportingProviderId[] = [
  "youtube",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
];

/**
 * Picks the account that actually represents the live connection: the most
 * recently updated CONNECTED row. The table keeps historical rows per
 * platform (re-consent creates a new grant with a different scope set), so
 * reading an arbitrary row would report scopes the current connection does
 * not hold.
 */
export function selectLiveAccount(
  rows: SocialAccountRow[],
  platform: string
): SocialAccountRow | null {
  const forPlatform = rows.filter((r) => r.platform === platform);
  if (forPlatform.length === 0) return null;

  const sorted = [...forPlatform].sort(
    (a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "")
  );
  return sorted.find((r) => r.status === "CONNECTED") ?? sorted[0];
}

/**
 * Pure derivation — no I/O, so the truthfulness rules are directly testable.
 */
export function deriveSocialProviderStatus(
  provider: ReportingProviderId,
  account: SocialAccountRow | null
): ReportingProviderStatus {
  const spec = REPORTING_SCOPES[provider];
  const displayName = spec?.displayName ?? provider;

  if (!account || account.status !== "CONNECTED") {
    return {
      provider,
      displayName,
      connected: false,
      status: "not_connected",
      lastSyncAt: null,
      reason: account ? "account_disconnected" : "no_account_connected",
      missingScopes: [],
    };
  }

  const lastSyncAt = account.last_sync_at ?? null;

  if (account.token_health && account.token_health !== "HEALTHY") {
    return {
      provider,
      displayName,
      connected: true,
      status: "error",
      lastSyncAt,
      reason: `token_${account.token_health.toLowerCase()}`,
      missingScopes: [],
    };
  }

  const granted = account.permissions ?? [];
  const required = spec?.anyOf ?? [];
  const satisfied = required.length === 0 || required.some((s) => granted.includes(s));

  if (!satisfied) {
    return {
      provider,
      displayName,
      connected: true,
      status: "permission_required",
      lastSyncAt,
      reason: "reporting_scope_not_granted",
      missingScopes: required,
    };
  }

  return {
    provider,
    displayName,
    connected: true,
    status: "connected",
    lastSyncAt,
    reason: null,
    missingScopes: [],
  };
}

/** GA4 measurement IDs are `G-` + an uppercase alphanumeric token. */
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export function deriveGoogleAnalyticsStatus(
  measurementId: string | undefined
): ReportingProviderStatus {
  const id = measurementId?.trim();

  if (!id) {
    return {
      provider: "google_analytics",
      displayName: "Google Analytics 4",
      connected: false,
      status: "not_configured",
      lastSyncAt: null,
      reason: "missing_ga_measurement_id",
      missingScopes: [],
    };
  }

  if (!GA_MEASUREMENT_ID_PATTERN.test(id)) {
    return {
      provider: "google_analytics",
      displayName: "Google Analytics 4",
      connected: false,
      status: "error",
      lastSyncAt: null,
      reason: "malformed_ga_measurement_id",
      missingScopes: [],
    };
  }

  return {
    provider: "google_analytics",
    displayName: "Google Analytics 4",
    connected: true,
    status: "connected",
    lastSyncAt: null,
    reason: null,
    missingScopes: [],
  };
}

/**
 * Search Console ownership is proved by the HTML-tag token rendered from
 * app/layout.tsx. Without that token set there is nothing to claim — the
 * honest answer is "not configured", never "active".
 */
export function deriveSearchConsoleStatus(
  verificationToken: string | undefined
): ReportingProviderStatus {
  const token = verificationToken?.trim();

  return {
    provider: "search_console",
    displayName: "Google Search Console",
    connected: Boolean(token),
    status: token ? "connected" : "not_configured",
    lastSyncAt: null,
    reason: token ? null : "missing_site_verification_token",
    missingScopes: [],
  };
}

/**
 * Vercel Web Analytics is instrumented in code (<Analytics /> in
 * app/layout.tsx) and collected by the platform, not by this app — there is
 * no server-side handle on its data here, so this reports instrumentation
 * only and never claims a visitor count.
 */
export function deriveVercelAnalyticsStatus(): ReportingProviderStatus {
  return {
    provider: "vercel_analytics",
    displayName: "Vercel Web Analytics",
    connected: true,
    status: "connected",
    lastSyncAt: null,
    reason: null,
    missingScopes: [],
  };
}

interface SocialAccountsReader {
  from(table: string): {
    select(columns: string): PromiseLike<{ data: SocialAccountRow[] | null; error: unknown }>;
  };
}

/**
 * Reads through the caller's session client, so RLS scopes social_accounts to
 * `owner_id = auth.uid()`. A read failure degrades to "provider_read_failed"
 * rather than to a false "connected".
 */
export async function getReportingConnectionsStatus(
  supabaseClient?: SocialAccountsReader | null
): Promise<ReportingProviderStatus[]> {
  const platformStatuses: ReportingProviderStatus[] = [
    deriveVercelAnalyticsStatus(),
    deriveGoogleAnalyticsStatus(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    deriveSearchConsoleStatus(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION),
  ];

  if (!supabaseClient) {
    return [
      ...platformStatuses,
      ...SOCIAL_PROVIDERS.map((provider) => deriveSocialProviderStatus(provider, null)),
    ];
  }

  let rows: SocialAccountRow[] = [];
  let readFailed = false;

  try {
    const { data, error } = await supabaseClient
      .from("social_accounts")
      .select("platform, status, token_health, permissions, last_sync_at, updated_at");
    if (error) readFailed = true;
    else rows = data ?? [];
  } catch {
    readFailed = true;
  }

  const socialStatuses = SOCIAL_PROVIDERS.map((provider) => {
    if (readFailed) {
      return {
        provider,
        displayName: REPORTING_SCOPES[provider]?.displayName ?? provider,
        connected: false,
        status: "error" as const,
        lastSyncAt: null,
        reason: "provider_read_failed",
        missingScopes: [],
      };
    }
    return deriveSocialProviderStatus(provider, selectLiveAccount(rows, provider));
  });

  return [...platformStatuses, ...socialStatuses];
}
