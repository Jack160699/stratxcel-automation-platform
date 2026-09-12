import { NextResponse } from "next/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  StandingObjectiveService,
  STANDING_OBJECTIVE_GOAL,
  CANONICAL_TENANT_ID,
} from "../../../../../packages/workforce-core/src/company-ops/standing-objective-service";
import { ContinuousRevenueEngine } from "../../../../../packages/workforce-core/src/company-ops/continuous-revenue-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = getTenantServiceContext();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || CANONICAL_TENANT_ID;

    const standingService = new StandingObjectiveService(supabase as any, tenantId);
    const standingMission = await standingService.ensureStandingObjective();

    // Fetch recent events for this standing mission
    const { data: events } = await supabase
      .from("mission_events")
      .select("id, event_type, payload, created_at")
      .eq("mission_id", standingMission.id)
      .order("created_at", { ascending: false })
      .limit(15);

    // Fetch recent CRM leads
    const { data: leads, count: leadsCount } = await supabase
      .from("crm_leads")
      .select("id, contact_name, contact_phone, contact_email, status, metadata, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Fetch recent mission artifacts (Google Drive files)
    const { data: artifacts } = await supabase
      .from("mission_artifacts")
      .select("id, kind, storage_ref, metadata, created_at")
      .eq("mission_id", standingMission.id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ok: true,
      standingMission,
      events: events || [],
      recentLeads: leads || [],
      totalLeadsCount: leadsCount || 0,
      artifacts: artifacts || [],
      directive: STANDING_OBJECTIVE_GOAL,
      status: "ACTIVE_AUTONOMOUS_LOOP",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = getTenantServiceContext();
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body allowed
    }

    const tenantId = body.tenantId || CANONICAL_TENANT_ID;
    const engine = new ContinuousRevenueEngine(supabase as any, tenantId);

    const result = await engine.runAutonomousCycle({
      tenantId,
      founderInput: body.founderInput,
      offerCategory: body.offerCategory,
      maxLeadsPerCycle: body.maxLeadsPerCycle || 10,
      dryRunOutreach: body.dryRunOutreach ?? false,
    });

    return NextResponse.json({
      ok: true,
      result,
      directive: STANDING_OBJECTIVE_GOAL,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
