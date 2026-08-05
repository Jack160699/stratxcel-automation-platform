import crypto from "node:crypto";
import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { IntegrationDisabledError } from "./adapter.ts";
import type { CreatePaymentLinkInput, PaymentLinkRow } from "./types.ts";
import { SUPPORTED_PAYMENT_PURPOSES } from "./types.ts";
import { processRazorpayWebhookEvent } from "./webhook-events.ts";

export function generatePaymentLinkReferenceId(): string {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString("hex");
  return `pl_${timestamp}_${randomHex}`;
}

export async function createPaymentLink(
  supabase: ServiceClient,
  input: CreatePaymentLinkInput,
  fetchFn: typeof fetch = fetch
): Promise<PaymentLinkRow> {
  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") {
    throw new IntegrationDisabledError("Razorpay");
  }

  if (!input.amountCents || input.amountCents <= 0 || !Number.isInteger(input.amountCents)) {
    throw new Error("Payment link amount must be a positive integer in paise (cents)");
  }

  if (!input.paymentPurpose || !SUPPORTED_PAYMENT_PURPOSES.has(input.paymentPurpose)) {
    throw new Error(`Payment purpose is required and must be one of: ${[...SUPPORTED_PAYMENT_PURPOSES].join(", ")}. Received: ${input.paymentPurpose}`);
  }

  const referenceId = input.referenceId ?? generatePaymentLinkReferenceId();
  const currency = input.currency ?? "INR";
  const expireByIso = input.expireBy ? new Date(input.expireBy).toISOString() : null;

  if (mode === "shadow") {
    const { data, error } = await supabase
      .from("payment_links")
      .insert({
        tenant_id: input.tenantId,
        provider: "razorpay",
        provider_link_id: null,
        reference_id: referenceId,
        amount_cents: input.amountCents,
        currency,
        status: "created",
        payment_purpose: input.paymentPurpose,
        mode: "test",
        short_url: null,
        description: input.description ?? null,
        customer_name: input.customerName ?? null,
        customer_email: input.customerEmail ?? null,
        customer_phone: input.customerPhone ?? null,
        expire_by: expireByIso,
        created_by: input.createdBy ?? null,
        metadata: { kind: "payment_link", shadow: true },
      })
      .select("*")
      .single();

    if (error) throw new Error("Failed to create shadow payment link record");
    return data as PaymentLinkRow;
  }

  // mode === "live"
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_INTEGRATION_MODE is 'live' but credentials are missing");
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.stratxcel.in";
  const callbackUrl = `${appBaseUrl}/payment/status?link_id=${referenceId}`;

  const payload: Record<string, unknown> = {
    amount: input.amountCents,
    currency,
    accept_partial: false,
    description: input.description ?? undefined,
    reference_id: referenceId,
    callback_url: callbackUrl,
    callback_method: "get",
    notes: {
      tenant_id: input.tenantId,
      reference_id: referenceId,
    },
  };

  if (input.customerName || input.customerEmail || input.customerPhone) {
    payload.customer = {
      name: input.customerName || undefined,
      email: input.customerEmail || undefined,
      contact: input.customerPhone || undefined,
    };
    payload.notify = {
      sms: Boolean(input.customerPhone),
      email: Boolean(input.customerEmail),
    };
  }

  if (expireByIso) {
    payload.expire_by = Math.floor(new Date(expireByIso).getTime() / 1000);
  }

  const response = await fetchFn("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch {
      // ignore
    }
    throw new Error(`Razorpay live payment link creation failed with HTTP ${response.status}: ${errBody}`);
  }

  let result: Record<string, unknown>;
  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Razorpay returned invalid JSON response");
  }

  const providerLinkId = (result.id as string) ?? null;
  const shortUrl = (result.short_url as string) ?? null;

  if (!providerLinkId) {
    throw new Error("Razorpay response missing payment link ID");
  }

  const { data, error } = await supabase
    .from("payment_links")
    .insert({
      tenant_id: input.tenantId,
      provider: "razorpay",
      provider_link_id: providerLinkId,
      reference_id: referenceId,
      amount_cents: input.amountCents,
      currency,
      status: "created",
      payment_purpose: input.paymentPurpose,
      mode: "live",
      short_url: shortUrl,
      description: input.description ?? null,
      customer_name: input.customerName ?? null,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      expire_by: expireByIso,
      created_by: input.createdBy ?? null,
      metadata: { kind: "payment_link", shadow: false, razorpay_id: providerLinkId },
    })
    .select("*")
    .single();

  if (error) {
    // Compensating action: cancel created link on Razorpay if local DB insert fails
    let cancelStatusMessage = `link ${providerLinkId} was automatically cancelled on Razorpay`;
    try {
      const cancelRes = await fetchFn(`https://api.razorpay.com/v1/payment_links/${providerLinkId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });
      if (cancelRes.ok) {
        console.log(`[Razorpay Compensation] Successfully cancelled link ${providerLinkId} after database insert failure.`);
      } else {
        cancelStatusMessage = `Compensation cancellation failed (HTTP ${cancelRes.status}). Manual review required for link ${providerLinkId}`;
        console.error(`[Razorpay Compensation] Cancellation for link ${providerLinkId} failed with HTTP ${cancelRes.status}`);
      }
    } catch (cancelErr) {
      cancelStatusMessage = `Compensation cancellation failed (HTTP network_error). Manual review required for link ${providerLinkId}`;
      console.error(`[Razorpay Compensation] Network error attempting to cancel link ${providerLinkId}:`, cancelErr);
    }

    throw new Error(`Failed to record live payment link record (${cancelStatusMessage})`);
  }

  return data as PaymentLinkRow;
}

export async function getPaymentLinksForTenant(
  supabase: ServiceClient,
  tenantId: string
): Promise<PaymentLinkRow[]> {
  const { data, error } = await supabase
    .from("payment_links")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Failed to fetch payment links for tenant");
  return (data as PaymentLinkRow[]) ?? [];
}

export const listPaymentLinks = getPaymentLinksForTenant;

export async function getPaymentLinkById(
  supabase: ServiceClient,
  id: string
): Promise<PaymentLinkRow | null> {
  const { data, error } = await supabase
    .from("payment_links")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch payment link");
  return (data as PaymentLinkRow) ?? null;
}

export async function getPaymentLinkByReferenceId(
  supabase: ServiceClient,
  referenceId: string
): Promise<PaymentLinkRow | null> {
  const { data, error } = await supabase
    .from("payment_links")
    .select("*")
    .eq("reference_id", referenceId)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch payment link");
  return (data as PaymentLinkRow) ?? null;
}

export async function cancelPaymentLink(
  supabase: ServiceClient,
  input: { linkId: string; tenantId: string },
  fetchFn: typeof fetch = fetch
): Promise<PaymentLinkRow> {
  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") {
    throw new IntegrationDisabledError("Razorpay");
  }

  const { data: link, error: fetchErr } = await supabase
    .from("payment_links")
    .select("*")
    .eq("id", input.linkId)
    .eq("tenant_id", input.tenantId)
    .single();

  if (fetchErr || !link) {
    throw new Error("Payment link not found or not owned by tenant");
  }

  if (link.status === "paid" || link.status === "cancelled" || link.status === "expired") {
    throw new Error(`Cannot cancel payment link in state '${link.status}'`);
  }

  if (mode === "live" && link.provider_link_id) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_INTEGRATION_MODE is 'live' but credentials are missing");
    }

    const response = await fetchFn(`https://api.razorpay.com/v1/payment_links/${link.provider_link_id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Razorpay live payment link cancellation failed with HTTP ${response.status}`);
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("payment_links")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", link.id)
    .select("*")
    .single();

  if (updateErr) throw new Error("Failed to update payment link status");
  return updated as PaymentLinkRow;
}

export interface ReconcilePaymentLinkInput {
  linkId: string;
  tenantId: string;
}

export interface ReconcilePaymentLinkResult {
  reconciled: boolean;
  link: PaymentLinkRow;
  razorpayStatus: string;
}

export async function reconcilePaymentLink(
  supabase: ServiceClient,
  input: ReconcilePaymentLinkInput,
  fetchFn: typeof fetch = fetch
): Promise<ReconcilePaymentLinkResult> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.linkId);
  const baseQuery = supabase.from("payment_links").select("*").eq("tenant_id", input.tenantId);
  const { data: link, error: fetchErr } = isUuid
    ? await baseQuery.or(`id.eq.${input.linkId},reference_id.eq.${input.linkId}`).maybeSingle()
    : await baseQuery.eq("reference_id", input.linkId).maybeSingle();

  if (fetchErr) throw new Error("Failed to load payment link");
  if (!link) throw new Error("Payment link not found or not owned by tenant");

  if (link.provider !== "razorpay") {
    throw new Error("Only Razorpay payment links can be reconciled");
  }
  if (!link.provider_link_id || link.provider_link_id.trim() === "") {
    throw new Error("Payment link does not have a provider link ID");
  }
  if (link.mode !== "live") {
    throw new Error("Only live payment links can be reconciled with Razorpay API");
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials missing from environment");
  }

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
  const response = await fetchFn(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(link.provider_link_id)}`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Razorpay API returned error status ${response.status}`);
  }

  const rzpData = (await response.json()) as Record<string, unknown>;

  const rzpId = (rzpData.id as string) ?? null;
  const rzpRefId = (rzpData.reference_id as string) ?? null;
  const rzpAmount = typeof rzpData.amount === "number" ? rzpData.amount : null;
  const rzpCurrency = (rzpData.currency as string) ?? null;
  const rzpStatus = (rzpData.status as string) ?? "unknown";

  if (
    rzpId !== link.provider_link_id ||
    rzpRefId !== link.reference_id ||
    rzpAmount !== link.amount_cents ||
    rzpCurrency !== link.currency
  ) {
    throw new Error("Razorpay Payment Link attributes do not match stored record");
  }

  if (rzpStatus === "paid" || rzpStatus === "partially_paid") {
    let rzpPaymentId: string | null = null;
    if (Array.isArray(rzpData.payments) && rzpData.payments.length > 0) {
      const firstPay = rzpData.payments[0] as Record<string, unknown>;
      rzpPaymentId = (firstPay.payment_id as string) || (firstPay.id as string) || null;
    }

    const payload = {
      payload: {
        payment_link: {
          entity: {
            id: link.provider_link_id,
            reference_id: link.reference_id,
            status: rzpStatus,
            amount: rzpAmount,
            currency: rzpCurrency,
          },
        },
        payment: {
          entity: {
            id: rzpPaymentId ?? undefined,
          },
        },
      },
    };

    const processRes = await processRazorpayWebhookEvent(supabase, {
      eventType: "payment_link.paid",
      payload,
    });

    if (!processRes.handled) {
      throw new Error(`Reconciliation failed: ${processRes.actionTaken}`);
    }

    const { data: updatedLink } = await supabase
      .from("payment_links")
      .select("*")
      .eq("id", link.id)
      .single();

    return {
      reconciled: true,
      link: (updatedLink as PaymentLinkRow) || link,
      razorpayStatus: rzpStatus,
    };
  }

  if (rzpStatus === "cancelled" || rzpStatus === "expired") {
    if (link.status === "created") {
      await supabase
        .from("payment_links")
        .update({ status: rzpStatus, updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }
  }

  const { data: currentLink } = await supabase
    .from("payment_links")
    .select("*")
    .eq("id", link.id)
    .single();

  return {
    reconciled: false,
    link: (currentLink as PaymentLinkRow) || link,
    razorpayStatus: rzpStatus,
  };
}
