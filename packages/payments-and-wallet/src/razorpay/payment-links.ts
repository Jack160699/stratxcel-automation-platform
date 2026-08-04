import crypto from "node:crypto";
import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { IntegrationDisabledError } from "./adapter.ts";
import type { CreatePaymentLinkInput, PaymentLinkRow } from "./types.ts";

export function generatePaymentLinkReferenceId(): string {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString("hex");
  return `pl_${timestamp}_${randomHex}`;
}

export async function createPaymentLink(
  supabase: ServiceClient,
  input: CreatePaymentLinkInput
): Promise<PaymentLinkRow> {
  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") {
    throw new IntegrationDisabledError("Razorpay");
  }

  if (!input.amountCents || input.amountCents <= 0 || !Number.isInteger(input.amountCents)) {
    throw new Error("Payment link amount must be a positive integer in paise (cents)");
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

  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Razorpay live payment link creation request failed");
  }

  const result = (await response.json()) as {
    id: string;
    short_url?: string;
    status?: string;
    amount: number;
    currency: string;
  };

  // Insert into Supabase. If DB insert fails, compensate by cancelling the newly created Razorpay payment link!
  const { data, error } = await supabase
    .from("payment_links")
    .insert({
      tenant_id: input.tenantId,
      provider: "razorpay",
      provider_link_id: result.id,
      reference_id: referenceId,
      amount_cents: result.amount,
      currency: result.currency,
      status: "created",
      mode: "live",
      short_url: result.short_url ?? null,
      description: input.description ?? null,
      customer_name: input.customerName ?? null,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      expire_by: expireByIso,
      created_by: input.createdBy ?? null,
      metadata: { kind: "payment_link", razorpay_status: result.status ?? "created" },
    })
    .select("*")
    .single();

  if (error) {
    // Compensation attempt: cancel newly created live link
    try {
      await fetch(`https://api.razorpay.com/v1/payment_links/${result.id}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });
      console.warn(`[Razorpay Compensation] Cancelled orphan payment link ${result.id} due to persistence failure.`);
    } catch (cancelErr) {
      console.error(`[Razorpay Compensation] Failed to cancel orphan payment link ${result.id}:`, cancelErr);
    }
    throw new Error("Failed to persist payment link record. Created link was automatically compensated.");
  }

  return data as PaymentLinkRow;
}

export async function listPaymentLinks(
  supabase: ServiceClient,
  tenantId: string
): Promise<PaymentLinkRow[]> {
  const { data, error } = await supabase
    .from("payment_links")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Failed to list payment links");
  return (data as PaymentLinkRow[]) ?? [];
}

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
  input: { linkId: string; tenantId: string }
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

    const response = await fetch(`https://api.razorpay.com/v1/payment_links/${link.provider_link_id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Razorpay live payment link cancellation failed");
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
