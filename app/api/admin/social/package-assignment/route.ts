import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerContext } from "@/lib/social/db-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  assignBrandProfileToTenant,
  assignSocialAccountToTenant,
  listAssignablePackageResources,
} from "@/lib/social/package-autopilot";
import { packageErrorForClient } from "@/lib/social/package-errors";

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

function brandLabelFromIdentity(identity: unknown): string | null {
  if (!identity || typeof identity !== "object") return null;
  const name = (identity as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });

  const service = createSupabaseServiceClient();
  const [assignment, unboundBrandsResult, unboundAccountsResult, boundBrand, boundAccounts] = await Promise.all([
    listAssignablePackageResources(service as Parameters<typeof listAssignablePackageResources>[0], {
      tenantId,
      actorUserId: ctx.ownerId,
    }),
    service.from("social_brand_profiles").select("id, identity, owner_id").is("tenant_id", null).order("updated_at", { ascending: false }).limit(50),
    service.from("social_accounts").select("id, platform, display_name, username, owner_id, status").is("tenant_id", null).eq("status", "CONNECTED").order("updated_at", { ascending: false }).limit(100),
    service.from("social_brand_profiles").select("id, identity").eq("tenant_id", tenantId).maybeSingle(),
    service.from("social_accounts").select("id, platform, display_name, username").eq("tenant_id", tenantId).eq("status", "CONNECTED"),
  ]);

  return NextResponse.json({
    assignment: {
      brand: assignment.brand,
      accounts: assignment.accounts.map((account) => ({
        ...account,
        platformLabel: PLATFORM_LABEL[account.platform] ?? account.platform,
      })),
    },
    unboundBrands: (unboundBrandsResult.data ?? []).map((row) => ({
      id: row.id,
      label: brandLabelFromIdentity(row.identity) ?? "Brand Brain",
      ownerId: row.owner_id,
    })),
    unboundAccounts: (unboundAccountsResult.data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      platformLabel: PLATFORM_LABEL[String(row.platform).toLowerCase()] ?? String(row.platform),
      label: (row.display_name as string | null) || (row.username as string) || String(row.platform),
      ownerId: row.owner_id,
    })),
    boundBrand: boundBrand.data
      ? { id: boundBrand.data.id, label: brandLabelFromIdentity(boundBrand.data.identity) ?? "Brand Brain" }
      : null,
    boundAccounts: (boundAccounts.data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      platformLabel: PLATFORM_LABEL[String(row.platform).toLowerCase()] ?? String(row.platform),
      label: (row.display_name as string | null) || (row.username as string) || String(row.platform),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });

  const service = createSupabaseServiceClient();
  try {
    switch (body.action) {
      case "assignBrand": {
        const brandProfileId = typeof body.brandProfileId === "string" ? body.brandProfileId : undefined;
        const result = await assignBrandProfileToTenant(service as Parameters<typeof assignBrandProfileToTenant>[0], {
          tenantId,
          actorUserId: ctx.ownerId,
          brandProfileId,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "assignAccount": {
        const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
        const platform = typeof body.platform === "string" ? body.platform : undefined;
        if (!accountId && !platform) return NextResponse.json({ error: "accountId or platform is required" }, { status: 400 });
        const result = await assignSocialAccountToTenant(service as Parameters<typeof assignSocialAccountToTenant>[0], {
          tenantId,
          actorUserId: ctx.ownerId,
          accountId,
          platform,
        });
        return NextResponse.json({ ok: true, result });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: packageErrorForClient(error) }, { status: 400 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
