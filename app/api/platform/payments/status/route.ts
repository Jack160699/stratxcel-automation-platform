import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getPaymentLinkByReferenceId, getPaymentLinkById, verifyRazorpayCallbackSignature } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const linkId = url.searchParams.get("link_id") || url.searchParams.get("reference_id") || url.searchParams.get("id");
  const rzpSig = url.searchParams.get("razorpay_signature");
  const rzpPaymentId = url.searchParams.get("razorpay_payment_id");
  const rzpLinkId = url.searchParams.get("razorpay_payment_link_id");
  const rzpStatus = url.searchParams.get("razorpay_payment_link_status");
  const rzpRefId = url.searchParams.get("razorpay_payment_link_reference_id");

  if (!linkId) {
    return Response.json({ error: "link_id or reference_id parameter is required" }, { status: 400 });
  }

  const { supabase } = getTenantServiceContext();
  let link = await getPaymentLinkByReferenceId(supabase, linkId);
  if (!link) {
    link = await getPaymentLinkById(supabase, linkId);
  }

  if (!link) {
    return Response.json({ error: "Payment record not found" }, { status: 404 });
  }

  let signatureVerified = false;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (rzpSig && keySecret && rzpLinkId && rzpRefId && rzpStatus && rzpPaymentId) {
    signatureVerified = verifyRazorpayCallbackSignature({
      paymentLinkId: rzpLinkId,
      paymentLinkReferenceId: rzpRefId,
      paymentLinkStatus: rzpStatus,
      paymentId: rzpPaymentId,
      signature: rzpSig,
      secret: keySecret,
    });
  }

  // Sanitized public summary (no tenant ID, user ID, internal DB keys, or secrets)
  return Response.json(
    {
      referenceId: link.reference_id,
      amountCents: link.amount_cents,
      currency: link.currency,
      status: link.status,
      description: link.description,
      shortUrl: link.short_url,
      mode: link.mode,
      paymentPurpose: link.payment_purpose,
      signatureVerified,
      verificationPending: link.status === "created" && Boolean(rzpPaymentId),
      createdAt: link.created_at,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
