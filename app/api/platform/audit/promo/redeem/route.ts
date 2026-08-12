import { createHash, randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { ensurePendingAuditOrder } from "@/lib/audit/ensure-pending-order";
import {
  AUDIT_GO_FREE_LIST_PRICE_CENTS,
  hashPromoCode,
  normalizePromoCode,
  publicPromoMessage,
} from "@/lib/promo/go-free";
import { enforcePromoRateLimit, promoRateLimitBucket } from "@/lib/promo/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  promoCode?: string;
  auditOrderId?: string;
  email?: string;
  paymentPurpose?: string;
  amountDueCents?: number;
  product?: string;
}

/**
 * Atomically redeems a Go Free Audit code for a pending Audit order.
 * Browser may only submit promoCode (+ email for guests). Discount/amount/
 * product/payment status from the client are ignored.
 */
export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_AUDIT_ENABLED")) {
    return Response.json(
      { error: "Audit checkout is being activated. Please check back shortly." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  // Explicitly reject subscription / non-audit product attempts without revealing internals.
  if (body.paymentPurpose === "subscription_payment" || body.product === "subscription") {
    return Response.json({ error: publicPromoMessage("wrong_product") }, { status: 400 });
  }

  const normalized = typeof body.promoCode === "string" ? normalizePromoCode(body.promoCode) : "";
  if (!normalized) {
    return Response.json({ error: publicPromoMessage("invalid_code") }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const identity = await resolveCanonicalIdentity();
    if (identity.state === "INTERNAL_STAFF" || identity.state === "STAFF_VIEWING_CLIENT") {
      return Response.json({ error: "Staff accounts cannot redeem customer promo codes" }, { status: 403 });
    }
  }

  const { supabase: service } = getTenantServiceContext();
  const allowed = await enforcePromoRateLimit(service, promoRateLimitBucket(request, "redeem"));
  if (!allowed) {
    return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let tenantId: string;
  let customerEmail: string;
  let guestEmail: string | null = null;

  if (user) {
    const memberships = await listMembershipsForUser(supabase, user.id);
    if (memberships.length > 0) {
      tenantId = memberships[0]!.tenant.id;
    } else {
      const slug = `audit-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const tenant = await createTenant(service, { slug, name: "My Business", ownerUserId: user.id });
      tenantId = tenant.id;
    }
    customerEmail = (user.email ?? "").trim().toLowerCase();
    if (!customerEmail || !EMAIL_PATTERN.test(customerEmail)) {
      return Response.json({ error: "A verified email address is required." }, { status: 400 });
    }
  } else {
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }
    guestEmail = email;
    customerEmail = email;

    // Prefer redeeming against an existing pending order for this email when auditOrderId given.
    if (body.auditOrderId) {
      const { data: existingOrder } = await service
        .from("audit_orders")
        .select("id, tenant_id, guest_email, status")
        .eq("id", body.auditOrderId)
        .maybeSingle();
      if (
        existingOrder &&
        existingOrder.status === "pending_payment" &&
        existingOrder.guest_email &&
        existingOrder.guest_email.trim().toLowerCase() === email
      ) {
        tenantId = existingOrder.tenant_id;
      } else {
        return Response.json({ error: publicPromoMessage("invalid_code") }, { status: 400 });
      }
    } else {
      const { data: tenant, error: tenantError } = await service
        .from("tenants")
        .insert({
          slug: `audit-guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: "My Business",
        })
        .select("id")
        .single();
      if (tenantError || !tenant) {
        return Response.json({ error: "Could not start complimentary checkout. Please try again." }, { status: 500 });
      }
      tenantId = tenant.id;
    }
  }

  let auditOrderId = body.auditOrderId;
  if (auditOrderId) {
    const { data: order } = await service
      .from("audit_orders")
      .select("id, tenant_id, status")
      .eq("id", auditOrderId)
      .maybeSingle();
    if (!order || order.tenant_id !== tenantId) {
      return Response.json({ error: publicPromoMessage("cross_tenant") }, { status: 400 });
    }
  } else {
    try {
      const ensured = await ensurePendingAuditOrder(service, { tenantId, guestEmail });
      auditOrderId = ensured.auditOrderId;
    } catch {
      return Response.json({ error: "Could not start complimentary checkout. Please try again." }, { status: 500 });
    }
  }

  const codeHash = hashPromoCode(normalized);
  const idempotencyKey = createHash("sha256")
    .update(`go-free:${auditOrderId}:${codeHash}:${customerEmail}`)
    .digest("hex");

  const { data: rpcRes, error: rpcErr } = await service.rpc("redeem_audit_go_free_code_v1", {
    p_code_hash: codeHash,
    p_audit_order_id: auditOrderId,
    p_expected_tenant_id: tenantId,
    p_customer_email: customerEmail,
    p_idempotency_key: idempotencyKey,
    p_actor_user_id: user?.id ?? null,
    p_list_price_cents: AUDIT_GO_FREE_LIST_PRICE_CENTS,
  });

  if (rpcErr) {
    console.error("go-free redeem rpc failed", rpcErr.message);
    return Response.json({ error: "Could not redeem this code. Please try again." }, { status: 500 });
  }

  const result = rpcRes as {
    success?: boolean;
    reason?: string;
    message?: string;
    audit_order_id?: string;
    redemption_id?: string;
    already_redeemed?: boolean;
  } | null;

  if (!result?.success) {
    return Response.json(
      { error: result?.message ?? publicPromoMessage(result?.reason) },
      { status: 400 }
    );
  }

  // Never create Razorpay artifacts for complimentary fulfilment.
  return Response.json(
    {
      ok: true,
      complimentary: true,
      fulfilmentSource: "promo",
      amountDueCents: 0,
      listPriceCents: AUDIT_GO_FREE_LIST_PRICE_CENTS,
      discountCents: AUDIT_GO_FREE_LIST_PRICE_CENTS,
      auditOrderId: result.audit_order_id ?? auditOrderId,
      redemptionId: result.redemption_id,
      alreadyRedeemed: Boolean(result.already_redeemed),
      accessPath: `/audit/access?auditOrderId=${encodeURIComponent(result.audit_order_id ?? auditOrderId!)}`,
      requestId: randomUUID(),
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
