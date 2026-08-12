import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireGoFreeAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not authenticated" };
  const staff = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!staff.ok) return { ok: false as const, status: staff.status, error: staff.error };
  return { ok: true as const, userId: user.id, role: staff.staff.role };
}

interface PatchBody {
  isActive?: boolean;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireGoFreeAdmin();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!id) return Response.json({ error: "promo id required" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (typeof body.isActive !== "boolean") {
    return Response.json({ error: "isActive boolean is required" }, { status: 400 });
  }

  const { supabase: service } = getTenantServiceContext();
  const { data: existing, error: existingError } = await service
    .from("promo_codes")
    .select("id, is_active, product_scope, max_redemptions, expires_at, code_prefix")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return Response.json({ error: "Go Free code not found" }, { status: 404 });
  }

  // Enabling is safe when the code still exists; redemption RPC still enforces expiry/limits.
  const { data: updated, error } = await service
    .from("promo_codes")
    .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, is_active, code_display, code_prefix, expires_at, max_redemptions")
    .single();

  if (error || !updated) {
    return Response.json({ error: "Could not update Go Free code" }, { status: 500 });
  }

  await service.from("platform_admin_events").insert({
    target_user_id: auth.userId,
    actor_user_id: auth.userId,
    actor_type: "staff_user",
    action: body.isActive ? "enable_promo_code" : "disable_promo_code",
    metadata: {
      promo_id: updated.id,
      product: "audit_fee",
      code_prefix: updated.code_prefix,
      max_redemptions: updated.max_redemptions,
      expires_at: updated.expires_at,
      staff_role: auth.role,
    },
  });

  return Response.json({ ok: true, code: updated }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireGoFreeAdmin();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const { supabase: service } = getTenantServiceContext();

  const { data: code, error } = await service
    .from("promo_codes")
    .select(
      "id, code_display, code_prefix, product_scope, discount_percent, max_redemptions, max_redemptions_per_customer, valid_from, expires_at, allowed_email, is_active, internal_note, created_by, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !code) return Response.json({ error: "Go Free code not found" }, { status: 404 });

  const { data: redemptions } = await service
    .from("promo_redemptions")
    .select(
      "id, tenant_id, customer_email, audit_order_id, list_price_cents, discount_cents, amount_due_cents, redeemed_at"
    )
    .eq("promo_code_id", id)
    .order("redeemed_at", { ascending: false })
    .limit(500);

  return Response.json(
    {
      code: { ...code, productLabel: "Business Growth Audit — ₹999" },
      redemptions: redemptions ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
