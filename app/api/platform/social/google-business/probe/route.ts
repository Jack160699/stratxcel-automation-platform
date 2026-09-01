import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { resolveAccessToken } from "@/lib/social/audit-connector-insights";
import {
  discoverAllGoogleBusinessLocations,
  matchGoogleBusinessLocation,
  getCanonicalGbpLocationResourceName,
} from "@/lib/social/providers/google-business";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/social/google-business/probe
 * Body: { tenantId }
 *
 * Real, live probe of Google Business Profile account and location access
 * using the customer's actual vaulted OAuth token.
 *
 * 1. Retrieves customer's vaulted Google OAuth token.
 * 2. Calls Google Account Management API + Business Information API to discover all accounts and locations.
 * 3. Matches against the tenant's canonical website (https://www.stratxcel.in) and brand identity.
 * 4. On match: updates social_accounts with the verified location resource name and rich metadata.
 * 5. Returns truthful, actionable resolution state.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };

  if (!body.tenantId) {
    return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  const { data: socialAccount, error: fetchErr } = await supabase
    .from("social_accounts")
    .select("id, platform, provider_account_id, username, display_name, status, metadata")
    .eq("tenant_id", body.tenantId)
    .in("platform", ["google_business", "google"])
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: `Account lookup failed: ${fetchErr.message}` }, { status: 500 });
  }

  if (!socialAccount) {
    return Response.json(
      {
        ok: false,
        state: "NOT_CONNECTED",
        reason: "No Google Business account connected for this workspace.",
      },
      { status: 404 }
    );
  }

  const tokens = await resolveAccessToken(supabase, socialAccount.id);
  if (!tokens?.accessToken) {
    return Response.json(
      {
        ok: false,
        state: "REAUTH_REQUIRED",
        reason: "Could not retrieve or refresh Google OAuth token. Reconnection required.",
      },
      { status: 401 }
    );
  }

  try {
    const brandBrain = await getCurrentBrandBrain(supabase, body.tenantId).catch(() => null);
    const brandContent = (brandBrain?.content ?? {}) as Record<string, unknown>;
    const canonicalWebsite =
      (typeof brandContent.website_url === "string" ? brandContent.website_url : null) ||
      "https://www.stratxcel.in";
    const brandName =
      (typeof brandContent.brand_name === "string" ? (brandContent.brand_name as string) : null) ||
      "StratXcel";

    const { accounts, locations } = await discoverAllGoogleBusinessLocations(tokens.accessToken);

    const matchResult = matchGoogleBusinessLocation(locations, {
      websiteUrl: canonicalWebsite,
      brandName: brandName,
    });

    const matched = matchResult.matchedLocation;
    const now = new Date().toISOString();

    if (matched) {
      const locationResourceName = getCanonicalGbpLocationResourceName(matched.accountName, matched.name);
      const formattedAddress = matched.storefrontAddress
        ? [
            matched.storefrontAddress.addressLines?.join(", "),
            matched.storefrontAddress.locality,
            matched.storefrontAddress.administrativeArea,
            matched.storefrontAddress.postalCode,
            matched.storefrontAddress.regionCode,
          ]
            .filter(Boolean)
            .join(", ")
        : null;

      const existingMeta = (socialAccount.metadata ?? {}) as Record<string, unknown>;
      const updatedMetadata: Record<string, unknown> = {
        ...existingMeta,
        location_resolved: true,
        location_resource_name: locationResourceName,
        location_name: matched.name,
        account_name: matched.accountName,
        business_title: matched.title || "StratXcel",
        business_category: matched.categories?.primaryCategory?.displayName ?? null,
        business_address: formattedAddress,
        business_website: matched.websiteUri ?? null,
        business_phone: matched.phoneNumbers?.primaryPhone ?? null,
        maps_url: matched.metadata?.mapsUri ?? null,
        place_id: matched.metadata?.placeId ?? null,
        permission_level: matched.permissionLevel ?? "OWNER_ACCESS",
        match_reason: matchResult.reason,
        match_confidence: matchResult.matchConfidence,
        accounts_count: accounts.length,
        locations_count: locations.length,
        discovered_at: now,
      };

      await supabase
        .from("social_accounts")
        .update({
          provider_account_id: locationResourceName,
          display_name: matched.title || "StratXcel",
          username: matched.title || socialAccount.username || "StratXcel",
          status: "CONNECTED",
          token_health: "HEALTHY",
          metadata: updatedMetadata,
          last_sync_at: now,
          updated_at: now,
        })
        .eq("id", socialAccount.id);

      return Response.json({
        ok: true,
        state: "CONNECTED",
        locationResolved: true,
        locationTitle: matched.title || "StratXcel",
        locationResourceName,
        permissionLevel: matched.permissionLevel ?? "OWNER_ACCESS",
        accountsCount: accounts.length,
        locationsCount: locations.length,
        reason: matchResult.reason,
      });
    } else {
      const existingMeta = (socialAccount.metadata ?? {}) as Record<string, unknown>;
      const updatedMetadata: Record<string, unknown> = {
        ...existingMeta,
        location_resolved: false,
        accounts_count: accounts.length,
        locations_count: locations.length,
        discovery_status:
          locations.length > 0
            ? "LOCATION_SELECTION_REQUIRED"
            : accounts.length > 0
            ? "NO_LOCATIONS_IN_ACCOUNTS"
            : "NO_GBP_ACCOUNTS_FOUND",
        discovered_at: now,
      };

      await supabase
        .from("social_accounts")
        .update({
          metadata: updatedMetadata,
          updated_at: now,
        })
        .eq("id", socialAccount.id);

      return Response.json({
        ok: true,
        state: "LOCATION_SETUP_REQUIRED",
        locationResolved: false,
        locationTitle: null,
        locationResourceName: null,
        permissionLevel: "ACCOUNT_AUTHENTICATED",
        accountsCount: accounts.length,
        locationsCount: locations.length,
        reason: matchResult.reason,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        state: "PROVIDER_ERROR",
        reason: `Google Business location probe failed: ${message}`,
      },
      { status: 500 }
    );
  }
}
