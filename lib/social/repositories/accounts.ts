import { createSupabaseServiceClient } from "../../supabase/service.ts";
import { encryptTokenPacked, decryptTokenPacked } from "../crypto.ts";
import type { OwnerContext } from "../db-context.ts";
import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export const PLATFORMS = ["instagram", "facebook", "threads", "linkedin", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface SocialAccountRow {
  id: string;
  owner_id: string;
  platform: string;
  provider_account_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  permissions: string[];
  status: string; // 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'RECONNECT_REQUIRED' — matches the social_accounts_status_check constraint
  token_health: string;
  last_sync_at: string | null;
  next_scheduled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const ACCOUNT_COLUMNS =
  "id, owner_id, platform, provider_account_id, username, display_name, avatar_url, permissions, status, token_health, last_sync_at, next_scheduled_at, metadata, created_at, updated_at";

/**
 * Tenant mode has no RLS policy on social_accounts scoped to tenant_id
 * (only the pre-existing owner_id/stratxcel_admins policy exists) — the
 * production V1.5 connector system itself already reads this table the
 * same way (see app/api/platform/social/autopilot/route.ts): membership is
 * verified up front by requireAgentTenantContext, then the service-role
 * client is used with an explicit tenant_id filter, never a bare
 * unfiltered service-role read. This is the existing, already-shipped
 * pattern for tenant-scoped social_accounts access, reused as-is rather
 * than inventing a second one.
 */
export async function listAccounts(ctx: AgentActorContext): Promise<SocialAccountRow[]> {
  if (isTenantAgentContext(ctx)) {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("social_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    return (data ?? []) as SocialAccountRow[];
  }
  const { data } = await ctx.supabase
    .from("social_accounts")
    .select(ACCOUNT_COLUMNS)
    .order("created_at", { ascending: false });
  return (data ?? []) as SocialAccountRow[];
}

/** Background-path variant (worker, health checks) — no user session exists. */
export async function listAccountsService(service: ServiceClient): Promise<SocialAccountRow[]> {
  const { data } = await service.from("social_accounts").select(ACCOUNT_COLUMNS).order("created_at", { ascending: false });
  return (data ?? []) as SocialAccountRow[];
}

export async function getAccountService(service: ServiceClient, id: string) {
  const { data } = await service.from("social_accounts").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle();
  return data as SocialAccountRow | null;
}

/**
 * Upserts a connected account + its encrypted tokens after a successful
 * OAuth exchange. Runs via service-role (the callback route has no
 * authenticated Stratzcel session yet at this exact moment — the admin *is*
 * signed in via requireAdmin(), but writing through the owner-scoped RLS
 * path here would work too; service-role is used because this also needs
 * to upsert social_tokens, whose only policy is implicit via social_accounts
 * ownership and is simplest to write from a single trusted path).
 */
export async function upsertConnectedAccount(
  service: ServiceClient,
  input: {
    ownerId: string;
    tenantId?: string | null;
    platform: Platform | string;
    providerAccountId: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    permissions: string[];
    accessToken: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
    metadata?: Record<string, unknown>;
  }
) {
  const now = new Date().toISOString();
  let accountId: string | null = null;

  // 1. If tenantId is provided, check for existing tenant account for this platform
  if (input.tenantId) {
    const { data: existingTenantAccount, error: fetchErr } = await service
      .from("social_accounts")
      .select("id, metadata")
      .eq("tenant_id", input.tenantId)
      .eq("platform", input.platform)
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`Failed to query social_accounts: ${fetchErr.message}`);
    }

    if (existingTenantAccount?.id) {
      const mergedMetadata = {
        ...((existingTenantAccount.metadata as Record<string, unknown>) ?? {}),
        ...(input.metadata ?? {}),
      };
      const { data: updated, error: updateErr } = await service
        .from("social_accounts")
        .update({
          owner_id: input.ownerId,
          provider_account_id: input.providerAccountId,
          username: input.username,
          display_name: input.displayName ?? null,
          avatar_url: input.avatarUrl ?? null,
          permissions: input.permissions,
          status: "CONNECTED",
          token_health: "HEALTHY",
          metadata: mergedMetadata,
          last_sync_at: now,
          updated_at: now,
        })
        .eq("id", existingTenantAccount.id)
        .select("id")
        .single();

      if (updateErr || !updated) {
        throw new Error(updateErr?.message ?? "Failed to update existing tenant social account");
      }
      accountId = updated.id;
    }
  }

  // 2. If no existing tenant row was updated, perform upsert
  if (!accountId) {
    if (input.tenantId) {
      const { data: account, error } = await service
        .from("social_accounts")
        .upsert(
          {
            owner_id: input.ownerId,
            tenant_id: input.tenantId,
            platform: input.platform,
            provider_account_id: input.providerAccountId,
            username: input.username,
            display_name: input.displayName ?? null,
            avatar_url: input.avatarUrl ?? null,
            permissions: input.permissions,
            status: "CONNECTED",
            token_health: "HEALTHY",
            metadata: input.metadata ?? {},
            last_sync_at: now,
            updated_at: now,
          },
          { onConflict: "tenant_id,platform" }
        )
        .select("id")
        .single();

      if (error || !account) {
        // Fallback to onConflict: owner_id,platform,provider_account_id
        const { data: fallbackAccount, error: fallbackError } = await service
          .from("social_accounts")
          .upsert(
            {
              owner_id: input.ownerId,
              tenant_id: input.tenantId,
              platform: input.platform,
              provider_account_id: input.providerAccountId,
              username: input.username,
              display_name: input.displayName ?? null,
              avatar_url: input.avatarUrl ?? null,
              permissions: input.permissions,
              status: "CONNECTED",
              token_health: "HEALTHY",
              metadata: input.metadata ?? {},
              last_sync_at: now,
              updated_at: now,
            },
            { onConflict: "owner_id,platform,provider_account_id" }
          )
          .select("id")
          .single();

        if (fallbackError || !fallbackAccount) {
          throw new Error(error?.message || fallbackError?.message || "account upsert failed");
        }
        accountId = fallbackAccount.id;
      } else {
        accountId = account.id;
      }
    } else {
      const { data: account, error } = await service
        .from("social_accounts")
        .upsert(
          {
            owner_id: input.ownerId,
            platform: input.platform,
            provider_account_id: input.providerAccountId,
            username: input.username,
            display_name: input.displayName ?? null,
            avatar_url: input.avatarUrl ?? null,
            permissions: input.permissions,
            status: "CONNECTED",
            token_health: "HEALTHY",
            metadata: input.metadata ?? {},
            last_sync_at: now,
            updated_at: now,
          },
          { onConflict: "owner_id,platform,provider_account_id" }
        )
        .select("id")
        .single();

      if (error || !account) throw new Error(error?.message ?? "account upsert failed");
      accountId = account.id;
    }
  }

  const expiresAt = input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString() : null;

  const { error: tokenError } = await service.from("social_tokens").upsert(
    {
      account_id: accountId,
      access_token_encrypted: encryptTokenPacked(input.accessToken),
      refresh_token_encrypted: input.refreshToken ? encryptTokenPacked(input.refreshToken) : null,
      expires_at: expiresAt,
      updated_at: now,
    },
    { onConflict: "account_id" }
  );
  if (tokenError) throw new Error(tokenError.message);

  return accountId;
}

export async function disconnectAccount(ctx: OwnerContext, id: string) {
  await ctx.supabase.from("social_accounts").update({ status: "DISCONNECTED", updated_at: new Date().toISOString() }).eq("id", id);
  // Tokens have no independent policy of their own (implicit via account
  // ownership) — wipe them via service role so a disconnected account never
  // retains usable credentials regardless of RLS path.
  const service = createSupabaseServiceClient();
  await service
    .from("social_tokens")
    .update({ access_token_encrypted: "", refresh_token_encrypted: null, expires_at: null, refresh_expires_at: null })
    .eq("account_id", id);
}

export async function markReauthRequired(service: ServiceClient, accountId: string) {
  // "RECONNECT_REQUIRED"/"EXPIRED" are the actual social_accounts_status_check
  // and social_accounts_token_health_check enum values — an earlier revision
  // of this function wrote two values that aren't in either CHECK constraint,
  // so this update always violated it and threw, silently masking every
  // reauth condition it was meant to record.
  await service.from("social_accounts").update({ status: "RECONNECT_REQUIRED", token_health: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", accountId);
}

export interface DecryptedTokenState {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export async function getDecryptedTokenState(service: ServiceClient, accountId: string): Promise<DecryptedTokenState> {
  const { data, error } = await service
    .from("social_tokens")
    .select("access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("account_id", accountId)
    .single();
  if (error || !data?.access_token_encrypted) throw new Error("no stored access token");
  return {
    accessToken: decryptTokenPacked(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted ? decryptTokenPacked(data.refresh_token_encrypted) : null,
    expiresAt: data.expires_at,
  };
}

export async function saveRefreshedAccessToken(
  service: ServiceClient,
  accountId: string,
  accessToken: string,
  expiresInSeconds?: number
) {
  const now = new Date();
  const expiresAt = expiresInSeconds ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString() : null;
  const { error: tokenError } = await service
    .from("social_tokens")
    .update({
      access_token_encrypted: encryptTokenPacked(accessToken),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    })
    .eq("account_id", accountId);
  if (tokenError) throw new Error(tokenError.message);

  const { error: accountError } = await service
    .from("social_accounts")
    .update({
      status: "CONNECTED",
      token_health: "HEALTHY",
      last_sync_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", accountId);
  if (accountError) throw new Error(accountError.message);
}

export async function getDecryptedAccessToken(service: ServiceClient, accountId: string): Promise<string> {
  return (await getDecryptedTokenState(service, accountId)).accessToken;
}
