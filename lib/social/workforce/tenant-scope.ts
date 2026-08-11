import type { ConnectedSocialAccount, TenantScopedAsset } from "./types.ts";

export class SocialTenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialTenantScopeError";
  }
}

/** All Social production resources must resolve to the same tenant — no owner-only fallback. */
export function assertSameTenant(expectedTenantId: string, actualTenantId: string | null | undefined, label: string): void {
  if (!expectedTenantId) throw new SocialTenantScopeError("tenant_required");
  if (!actualTenantId || actualTenantId !== expectedTenantId) {
    throw new SocialTenantScopeError(`cross_tenant_${label}_rejected`);
  }
}

export function assertAccountInTenant(
  expectedTenantId: string,
  account: ConnectedSocialAccount | null | undefined,
): ConnectedSocialAccount {
  if (!account) throw new SocialTenantScopeError("account_not_found");
  assertSameTenant(expectedTenantId, account.tenantId, "account");
  if (String(account.status).toUpperCase() !== "CONNECTED") {
    throw new SocialTenantScopeError("account_not_connected");
  }
  return account;
}

export function assertAssetInTenant(
  expectedTenantId: string,
  asset: TenantScopedAsset | null | undefined,
): TenantScopedAsset {
  if (!asset) throw new SocialTenantScopeError("asset_not_found");
  assertSameTenant(expectedTenantId, asset.tenantId, "asset");
  return asset;
}

export function assertAssetsInTenant(
  expectedTenantId: string,
  assets: readonly (TenantScopedAsset | null | undefined)[],
): TenantScopedAsset[] {
  return assets.map((asset) => assertAssetInTenant(expectedTenantId, asset));
}

export function assertBrandInTenant(
  expectedTenantId: string,
  brand: { id: string; tenantId: string | null } | null | undefined,
): { id: string; tenantId: string } {
  if (!brand) throw new SocialTenantScopeError("brand_not_found");
  assertSameTenant(expectedTenantId, brand.tenantId, "brand");
  return { id: brand.id, tenantId: brand.tenantId as string };
}

/**
 * Bind account + brand + assets + queue/job tenant in one fail-closed check.
 * Rejects any owner-only production path that lacks tenant identity.
 */
export function assertSocialExecutionTenantBundle(input: {
  tenantId: string;
  account: ConnectedSocialAccount | null | undefined;
  brand?: { id: string; tenantId: string | null } | null;
  assets?: readonly (TenantScopedAsset | null | undefined)[];
  queueTenantId?: string | null;
  jobTenantId?: string | null;
}): void {
  assertAccountInTenant(input.tenantId, input.account);
  if (input.brand !== undefined) assertBrandInTenant(input.tenantId, input.brand);
  if (input.assets) assertAssetsInTenant(input.tenantId, input.assets);
  if (input.queueTenantId !== undefined) assertSameTenant(input.tenantId, input.queueTenantId, "queue");
  if (input.jobTenantId !== undefined) assertSameTenant(input.tenantId, input.jobTenantId, "job");
}
