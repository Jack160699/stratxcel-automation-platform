import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { resolveAccessToken } from "@/lib/social/audit-connector-insights";
import { claimGoogleLocation, getCanonicalGbpLocationResourceName, type GbpLocation } from "@/lib/social/providers/google-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/social/google-business/claim
 * Body: { tenantId }
 *
 * Claims the exact, already-discovered, genuinely-unclaimed Google location
 * the probe route's googleLocations:search found for this tenant (STRATXCEL
 * — AUTONOMOUS BUSINESS PROFILE brief, Section 12/13/57) -- never a
 * fabricated new listing. A deliberate, customer-clicked action (never
 * autonomous): claiming a location is a real, public, hard-to-reverse
 * action on the customer's actual Google Business Profile, so this
 * endpoint only ever acts on data the customer has already seen surfaced
 * on /app/integrations, and only when the stored search result says
 * `claimable: true` (unclaimed, and a real account exists to claim under --
 * recomputed here from live data, never trusted from the client).
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
    .select("id, status, metadata")
    .eq("tenant_id", body.tenantId)
    .in("platform", ["google_business", "google"])
    .maybeSingle();

  if (fetchErr) return Response.json({ error: `Account lookup failed: ${fetchErr.message}` }, { status: 500 });
  if (!socialAccount) return Response.json({ ok: false, reason: "No Google Business account connected for this workspace." }, { status: 404 });

  const meta = (socialAccount.metadata ?? {}) as Record<string, unknown>;
  const search = (meta.google_location_search ?? null) as
    | { name: string | null; raw_location?: GbpLocation | null; request_admin_rights_uri?: string | null }
    | null;
  const accountName = typeof meta.account_name === "string" ? meta.account_name : null;

  // Recomputed server-side, never trusted from the request body -- the
  // exact same "claimable" definition the probe route already applied
  // (unclaimed listing + a real account to create under).
  if (!search?.name || !search.raw_location) {
    return Response.json(
      { ok: false, reason: "No matching Google location has been found for this business yet. Run a refresh first." },
      { status: 409 }
    );
  }
  if (search.request_admin_rights_uri) {
    return Response.json(
      { ok: false, reason: "This listing is already managed by another account -- request access instead of claiming it.", requestAdminRightsUri: search.request_admin_rights_uri },
      { status: 409 }
    );
  }
  if (!accountName) {
    return Response.json(
      {
        ok: false,
        reason:
          "Your Google account has no Business Profile account to claim this listing under yet -- Google requires setting one up at business.google.com first (personal accounts cannot be created via API).",
      },
      { status: 409 }
    );
  }

  const tokens = await resolveAccessToken(supabase, socialAccount.id);
  if (!tokens?.accessToken) {
    return Response.json({ ok: false, reason: "Could not retrieve or refresh Google OAuth token. Reconnection required." }, { status: 401 });
  }

  try {
    // Idempotent by (account, the exact googleLocations/{id} being claimed)
    // -- a retried click on the same real match never double-submits.
    const requestId = `claim-${search.name.replace(/[^a-zA-Z0-9]/g, "-")}`.slice(0, 50);
    const claimed = await claimGoogleLocation(tokens.accessToken, accountName, search.raw_location, requestId);
    const locationResourceName = getCanonicalGbpLocationResourceName(accountName, claimed.name);
    const now = new Date().toISOString();

    await supabase
      .from("social_accounts")
      .update({
        provider_account_id: locationResourceName,
        status: "CONNECTED",
        token_health: "HEALTHY",
        metadata: { ...meta, location_resolved: true, location_resource_name: locationResourceName, claimed_at: now },
        last_sync_at: now,
        updated_at: now,
      })
      .eq("id", socialAccount.id);

    return Response.json({ ok: true, locationResourceName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, reason: `Claiming this Google location failed: ${message}` }, { status: 502 });
  }
}
