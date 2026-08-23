import { NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getDecryptedTokenState, saveRefreshedAccessToken } from "@/lib/social/repositories/accounts";
import { googleBusinessProvider } from "@/lib/social/providers/google-business";

/**
 * Real, read-only ground-truth check for the Google Business Profile write
 * surface (Posts/Reviews/profile edits) this app currently stubs. Answers
 * one question with a live call, not a guess: does the Business Profile
 * API actually work for this tenant's real, stored connection right now —
 * and separately, is the Local Posts surface specifically reachable at all
 * (Google gates that behind a manual approval form independent of OAuth
 * consent; an unapproved project reads back distinctly from a scope/token
 * problem). Nothing here mutates anything at Google.
 *
 * Temporary diagnostic — not part of the customer-facing product surface.
 * Delete once the real Posts/Reviews build lands or the access question is
 * settled either way.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireClientContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: 401 });
  if (ctx.accessMode !== "staff_support") {
    const isMember = await isMemberOfTenant(ctx.supabase, ctx.userId, tenantId);
    if (!isMember) return NextResponse.json({ error: "Not a member of this client" }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  const { data: account } = await service
    .from("social_accounts")
    .select("id, provider_account_id, display_name, username")
    .eq("tenant_id", tenantId)
    .eq("platform", "google_business")
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "No google_business account on this tenant" }, { status: 404 });

  let tokenState;
  try {
    tokenState = await getDecryptedTokenState(service, account.id);
  } catch (err) {
    return NextResponse.json({ step: "load_token", error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }

  async function callGoogle(url: string, accessToken: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const bodyText = await res.text();
    let body: unknown = bodyText;
    try {
      body = JSON.parse(bodyText);
    } catch {
      // leave as text
    }
    return { status: res.status, ok: res.ok, body };
  }

  async function withFreshToken<T>(run: (accessToken: string) => Promise<T & { status: number }>) {
    let result = await run(tokenState!.accessToken);
    if (result.status === 401 && tokenState!.refreshToken) {
      try {
        if (!googleBusinessProvider.refreshAccessToken) throw new Error("provider has no refreshAccessToken");
        const refreshed = await googleBusinessProvider.refreshAccessToken(tokenState!.refreshToken);
        await saveRefreshedAccessToken(service, account!.id, refreshed.accessToken, refreshed.expiresInSeconds);
        result = await run(refreshed.accessToken);
      } catch (err) {
        return { ...result, refreshError: err instanceof Error ? err.message : String(err) };
      }
    }
    return result;
  }

  // 1) Exactly the call this app's own audit engine already makes in
  //    production, against the exact stored provider_account_id.
  const storedLocationRead = await withFreshToken((t) =>
    callGoogle(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account!.provider_account_id}?readMask=title,storefrontAddress,websiteUri,categories`,
      t
    )
  );

  // 2) Fresh account discovery, independent of whatever was stored at
  //    connect time — tells us whether a real accounts/{id} exists at all.
  const accountDiscovery = await withFreshToken((t) =>
    callGoogle("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", t)
  );

  let locationsForFirstAccount: unknown = null;
  const firstAccountName =
    accountDiscovery.ok && accountDiscovery.body && typeof accountDiscovery.body === "object"
      ? (accountDiscovery.body as { accounts?: Array<{ name?: string }> }).accounts?.[0]?.name
      : null;
  if (firstAccountName) {
    locationsForFirstAccount = await withFreshToken((t) =>
      callGoogle(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${firstAccountName}/locations?readMask=name,title`,
        t
      )
    );
  }

  // 3) Local Posts surface specifically — this is the one Google gates
  //    behind a separate manual approval form, independent of scope/OAuth.
  //    Use whatever real location resource name step 2 found, falling back
  //    to the stored provider_account_id shaped as a location path.
  let postsLocationName: string | null = null;
  if (locationsForFirstAccount && typeof locationsForFirstAccount === "object") {
    const locs = (locationsForFirstAccount as { body?: { locations?: Array<{ name?: string }> } }).body?.locations;
    postsLocationName = locs?.[0]?.name ?? null;
  }
  const postsProbeTarget =
    postsLocationName ??
    (firstAccountName ? `${firstAccountName}/locations/${account.provider_account_id}` : `locations/${account.provider_account_id}`);
  const localPostsRead = await withFreshToken((t) =>
    callGoogle(`https://mybusiness.googleapis.com/v4/${postsProbeTarget}/localPosts`, t)
  );

  return NextResponse.json({
    storedProviderAccountId: account.provider_account_id,
    storedLocationRead,
    accountDiscovery,
    locationsForFirstAccount,
    postsProbeTarget,
    localPostsRead,
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
