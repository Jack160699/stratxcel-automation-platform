import { NextRequest, NextResponse } from "next/server";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { fetchOfficeTelemetry } from "@/lib/office/office-telemetry-service";

export async function GET(request: NextRequest) {
  try {
    const identity = await resolveCanonicalIdentity({ routeSurface: "admin" });
    if (identity.state === "NO_SESSION") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "Missing required tenantId parameter" }, { status: 400 });
    }

    // Use service context to read live telemetry scoped to this tenant
    const { supabase } = getTenantServiceContext();

    // Verify tenant exists
    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantErr || !tenantRow) {
      return NextResponse.json({ error: "Tenant not found or access denied" }, { status: 404 });
    }

    const telemetry = await fetchOfficeTelemetry(supabase, tenantId, tenantRow.name);
    return NextResponse.json({ ok: true, telemetry });
  } catch (err: any) {
    console.error("[OFFICE_TELEMETRY_ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error fetching office telemetry", detail: err.message },
      { status: 500 }
    );
  }
}
