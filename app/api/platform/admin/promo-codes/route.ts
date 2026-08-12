import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import {
  generateAuditGoFreeCode,
  hashPromoCode,
  isCustomPromoCodeFormat,
  normalizePromoCode,
  promoCodePrefix,
} from "@/lib/promo/go-free";

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

export async function GET() {
  const auth = await requireGoFreeAdmin();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { supabase: service } = getTenantServiceContext();
  const { data: codes, error } = await service
    .from("promo_codes")
    .select(
      "id, code_display, code_prefix, product_scope, payment_purpose, discount_percent, max_redemptions, max_redemptions_per_customer, valid_from, expires_at, allowed_email, is_active, internal_note, created_by, created_at, updated_at"
    )
    .eq("payment_purpose", "audit_fee")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: "Could not load Go Free codes" }, { status: 500 });
  }

  const ids = (codes ?? []).map((c) => c.id);
  const useCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: redemptions } = await service.from("promo_redemptions").select("promo_code_id").in("promo_code_id", ids);
    for (const row of redemptions ?? []) {
      useCounts.set(row.promo_code_id, (useCounts.get(row.promo_code_id) ?? 0) + 1);
    }
  }

  return Response.json(
    {
      codes: (codes ?? []).map((c) => ({
        ...c,
        productLabel: "Business Growth Audit — ₹999",
        redemptionCount: useCounts.get(c.id) ?? 0,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

interface CreateBody {
  customCode?: string;
  generate?: boolean;
  maxRedemptions?: number | null;
  maxRedemptionsPerCustomer?: number;
  validFrom?: string | null;
  expiresAt?: string | null;
  allowedEmail?: string | null;
  internalNote?: string | null;
  isActive?: boolean;
}

export async function POST(request: Request) {
  const auth = await requireGoFreeAdmin();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  let codeDisplay: string;
  if (body.generate || !body.customCode?.trim()) {
    codeDisplay = generateAuditGoFreeCode();
  } else {
    codeDisplay = normalizePromoCode(body.customCode);
    if (!isCustomPromoCodeFormat(codeDisplay)) {
      return Response.json({ error: "Custom code must be 3–48 characters (A–Z, 0–9, _ or -)." }, { status: 400 });
    }
  }

  const maxRedemptions =
    body.maxRedemptions === null || body.maxRedemptions === undefined
      ? 1
      : Number(body.maxRedemptions);
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
    return Response.json({ error: "Maximum total uses must be a positive integer." }, { status: 400 });
  }

  const maxPerCustomer = Number(body.maxRedemptionsPerCustomer ?? 1);
  if (!Number.isInteger(maxPerCustomer) || maxPerCustomer < 1) {
    return Response.json({ error: "Maximum uses per customer must be a positive integer." }, { status: 400 });
  }

  const allowedEmail = body.allowedEmail?.trim().toLowerCase() || null;
  if (allowedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail)) {
    return Response.json({ error: "Optional customer restriction must be a valid email." }, { status: 400 });
  }

  const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
  if (Number.isNaN(validFrom.getTime())) {
    return Response.json({ error: "Valid from must be a valid date/time." }, { status: 400 });
  }
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return Response.json({ error: "Expires must be a valid date/time or empty for Never." }, { status: 400 });
  }
  if (expiresAt && expiresAt <= validFrom) {
    return Response.json({ error: "Expires must be after Valid from." }, { status: 400 });
  }

  const { supabase: service } = getTenantServiceContext();
  const insertRow = {
    code_hash: hashPromoCode(codeDisplay),
    code_display: codeDisplay,
    code_prefix: promoCodePrefix(codeDisplay),
    product_scope: "audit_fee",
    payment_purpose: "audit_fee",
    discount_type: "percent",
    discount_percent: 100,
    max_redemptions: maxRedemptions,
    max_redemptions_per_customer: maxPerCustomer,
    valid_from: validFrom.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    allowed_email: allowedEmail,
    is_active: body.isActive !== false,
    internal_note: body.internalNote?.trim() || null,
    created_by: auth.userId,
  };

  const { data: created, error } = await service.from("promo_codes").insert(insertRow).select("*").single();
  if (error || !created) {
    if (error?.message?.toLowerCase().includes("duplicate") || error?.code === "23505") {
      return Response.json({ error: "That code already exists." }, { status: 409 });
    }
    console.error("create promo code failed", error?.message);
    return Response.json({ error: "Could not create Go Free code." }, { status: 500 });
  }

  await service.from("platform_admin_events").insert({
    target_user_id: auth.userId,
    actor_user_id: auth.userId,
    actor_type: "staff_user",
    action: "create_promo_code",
    metadata: {
      promo_id: created.id,
      product: "audit_fee",
      code_prefix: created.code_prefix,
      max_redemptions: created.max_redemptions,
      max_redemptions_per_customer: created.max_redemptions_per_customer,
      expires_at: created.expires_at,
      allowed_email: created.allowed_email ? "[redacted]" : null,
      staff_role: auth.role,
    },
  });

  return Response.json(
    {
      ok: true,
      message: "GO FREE CODE CREATED",
      code: {
        id: created.id,
        codeDisplay: created.code_display,
        productLabel: "Business Growth Audit",
        discountPercent: 100,
        redemptionCount: 0,
        maxRedemptions: created.max_redemptions,
        expiresAt: created.expires_at,
        isActive: created.is_active,
        validFrom: created.valid_from,
        allowedEmail: created.allowed_email,
        internalNote: created.internal_note,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
