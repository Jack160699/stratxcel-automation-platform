import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Provider-account binding for tenant social connections.
 *
 * A reconnect used to overwrite a tenant's existing connection with whichever
 * provider account approved the consent screen. Found while preparing the
 * Durg Bhilai Solar Instagram reconnect: the operator's browser was also
 * signed in to the StratXcel corporate Instagram, and a consent approved from
 * that login would have re-pointed DBS's connection row -- and every DBS
 * publishing job keyed on it -- at the corporate account without any error.
 *
 * Same principle as the Facebook pageId binding: the expected provider
 * account is signed into the OAuth state at /connect, and the callback refuses
 * a token from any other account before anything is persisted. The
 * persistence layer enforces the same rule independently, so a state issued
 * without a binding still cannot re-point an existing tenant connection.
 *
 * Only Instagram is bound today. Other platforms keep their existing
 * account-switching behaviour (Facebook has its own Page-level binding).
 */
export const ACCOUNT_BOUND_PLATFORMS: ReadonlySet<string> = new Set(["instagram"]);

export class OAuthAccountMismatchError extends Error {
  readonly platform: string;
  readonly expectedAccountId: string;
  readonly actualAccountId: string;

  constructor(platform: string, expectedAccountId: string, actualAccountId: string) {
    super(
      `${platform} authorization came from account ${actualAccountId || "(unknown)"}, but this connection is bound to account ${expectedAccountId}. Sign in to the bound account and reconnect.`
    );
    this.name = "OAuthAccountMismatchError";
    this.platform = platform;
    this.expectedAccountId = expectedAccountId;
    this.actualAccountId = actualAccountId;
  }
}

/** Throws unless the authorized account is exactly the bound one. No binding means nothing to enforce. */
export function assertBoundProviderAccount(
  platform: string,
  expectedAccountId: string | null | undefined,
  actualAccountId: string | null | undefined
): void {
  if (!expectedAccountId) return;
  if (actualAccountId !== expectedAccountId) {
    throw new OAuthAccountMismatchError(platform, expectedAccountId, actualAccountId ?? "");
  }
}

/**
 * The provider account a tenant's connection for this platform is already
 * bound to, read from that tenant's own row (tenant_id + platform, never an
 * unscoped first row). Undefined when the platform is not bound or the tenant
 * has never connected it. A lookup failure throws so /connect fails closed
 * rather than issuing an unbound state.
 */
export async function resolveExpectedProviderAccountId(
  service: SupabaseClient,
  platform: string,
  tenantId: string
): Promise<string | undefined> {
  if (!ACCOUNT_BOUND_PLATFORMS.has(platform)) return undefined;

  const { data, error } = await service
    .from("social_accounts")
    .select("provider_account_id")
    .eq("tenant_id", tenantId)
    .eq("platform", platform)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve bound ${platform} account: ${error.message}`);
  return (data?.provider_account_id as string | null | undefined) || undefined;
}
