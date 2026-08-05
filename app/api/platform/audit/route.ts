import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Engine mode: default "disabled" for hotfix baseline (FOUNDATION_ONLY)
const AUDIT_ENGINE_MODE = process.env.AUDIT_ENGINE_MODE ?? "disabled";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const auditId = searchParams.get("auditId");

  // Fetch user's tenant memberships to ensure strict cross-tenant isolation
  const { data: userTenants } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id);

  const allowedTenantIds = (userTenants ?? []).map((t) => t.tenant_id).filter(Boolean);

  if (auditId) {
    // SECURE LOOKUP: Use authenticated Supabase client (RLS enforced)
    // and explicitly verify user_id or tenant_id ownership.
    let query = supabase
      .from("public_audit_requests")
      .select("*")
      .eq("id", auditId);

    if (allowedTenantIds.length > 0) {
      query = query.or(`user_id.eq.${user.id},tenant_id.in.(${allowedTenantIds.join(",")})`);
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data: audit, error } = await query.maybeSingle();

    if (error || !audit) {
      return Response.json({ error: "Audit record not found or access denied." }, { status: 404 });
    }

    return Response.json({ audit }, { headers: { "Cache-Control": "no-store" } });
  }

  // SECURE LIST: Only return audits belonging to user or user's authorized tenants
  let listQuery = supabase
    .from("public_audit_requests")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(20);

  if (allowedTenantIds.length > 0) {
    listQuery = listQuery.or(`user_id.eq.${user.id},tenant_id.in.(${allowedTenantIds.join(",")})`);
  } else {
    listQuery = listQuery.eq("user_id", user.id);
  }

  const { data: list, error } = await listQuery;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ audits: list ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      businessName,
      contactEmail,
      contactPhone,
      industry,
      websiteUrl,
      goals,
      auditAnswers,
    } = body;

    if (!businessName || typeof businessName !== "string" || businessName.trim().length < 2) {
      return Response.json({ error: "Business name is required." }, { status: 400 });
    }

    // Resolve user's primary active tenant membership
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const tenantId = membership?.tenant_id ?? null;

    // Fetch tenant Brand Brain version if available
    let brandBrainVersion = 1;
    if (tenantId) {
      const { data: brandBrain } = await supabase
        .from("brand_brain_versions")
        .select("version")
        .eq("tenant_id", tenantId)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (brandBrain?.version) brandBrainVersion = brandBrain.version;
    }

    // SECURE INSERT: Save user's audit request cleanly using RLS client
    // When AUDIT_ENGINE_MODE is "disabled", status is "saved" (FOUNDATION_ONLY)
    const initialJobStatus = AUDIT_ENGINE_MODE === "live" ? "queued" : "saved";

    const { data: audit, error: insertErr } = await supabase
      .from("public_audit_requests")
      .insert({
        business_name: businessName.trim(),
        contact_email: (contactEmail || user.email || "").trim().toLowerCase(),
        contact_phone: contactPhone ? contactPhone.trim() : null,
        industry: industry ? industry.trim() : null,
        website_url: websiteUrl ? websiteUrl.trim() : null,
        goals: goals ? goals.trim() : null,
        source: "authenticated_app_audit",
        status: "new",
        requested_product: "audit_fee",
        tenant_id: tenantId,
        user_id: user.id,
        brand_brain_version: brandBrainVersion,
        job_status: initialJobStatus,
        progress_percentage: initialJobStatus === "saved" ? 100 : 10,
        started_at: new Date().toISOString(),
        audit_answers: typeof auditAnswers === "object" && auditAnswers !== null ? auditAnswers : {},
        report_data: initialJobStatus === "saved" ? {
          notice: "Automated audit analysis is being prepared. Your business information has been saved, and the Stratxcel team can review it with you.",
          engineMode: AUDIT_ENGINE_MODE,
          featureStatus: "FOUNDATION_ONLY",
        } : {},
        evidence_data: [],
      })
      .select("id")
      .single();

    if (insertErr || !audit) {
      console.error("[Audit Save Error]", insertErr?.message);
      return Response.json({ error: "Failed to save audit request." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      auditId: audit.id,
      jobStatus: initialJobStatus,
      engineMode: AUDIT_ENGINE_MODE,
      message: "Automated audit analysis is being prepared. Your business information has been saved, and the Stratxcel team can review it with you.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process audit request";
    return Response.json({ error: msg }, { status: 400 });
  }
}
