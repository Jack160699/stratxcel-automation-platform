import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";
import {
  AUDIT_GO_FREE_LIST_PRICE_CENTS,
  hashPromoCode,
  normalizePromoCode,
  publicPromoMessage,
} from "@/lib/promo/go-free";
import { enforcePromoRateLimit, promoRateLimitBucket } from "@/lib/promo/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  promoCode?: string;
  email?: string;
  paymentPurpose?: string;
  amountDueCents?: number;
  product?: string;
}

/** Preview-only Go Free validation. Never trusts client amounts/products. */
export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_AUDIT_ENABLED")) {
    return Response.json({ error: "Audit checkout is being activated. Please check back shortly." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.paymentPurpose === "subscription_payment" || body.product === "subscription") {
    return Response.json({ error: publicPromoMessage("wrong_product"), valid: false }, { status: 400 });
  }

  const normalized = typeof body.promoCode === "string" ? normalizePromoCode(body.promoCode) : "";
  if (!normalized) {
    return Response.json({ error: publicPromoMessage("invalid_code"), valid: false }, { status: 400 });
  }

  const { supabase: service } = getTenantServiceContext();
  const allowed = await enforcePromoRateLimit(service, promoRateLimitBucket(request, "validate"), 30, 900);
  if (!allowed) {
    return Response.json({ error: "Too many attempts. Please try again later.", valid: false }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = (body.email?.trim().toLowerCase() || user?.email?.trim().toLowerCase() || "") || null;
  const { data, error } = await service.rpc("validate_audit_go_free_code_v1", {
    p_code_hash: hashPromoCode(normalized),
    p_customer_email: email,
  });

  if (error) {
    console.error("go-free validate rpc failed", error.message);
    return Response.json({ error: publicPromoMessage("invalid_code"), valid: false }, { status: 400 });
  }

  const result = data as {
    valid?: boolean;
    reason?: string;
    message?: string;
    discount_cents?: number;
    amount_due_cents?: number;
  } | null;

  if (!result?.valid) {
    return Response.json(
      { valid: false, error: result?.message ?? publicPromoMessage(result?.reason) },
      { status: 400 }
    );
  }

  return Response.json(
    {
      valid: true,
      product: "Business Growth Audit",
      listPriceCents: AUDIT_GO_FREE_LIST_PRICE_CENTS,
      discountCents: AUDIT_GO_FREE_LIST_PRICE_CENTS,
      amountDueCents: 0,
      // Echo ignored: any client-supplied amountDueCents is irrelevant.
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
