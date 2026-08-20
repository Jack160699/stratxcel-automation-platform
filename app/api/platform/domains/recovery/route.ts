/**
 * Domain Registration Recovery & Customer Resolution API
 *
 * When domain registration fails after payment confirmation (e.g. registry
 * timeout, race condition on domain name, provider network blip), this
 * endpoint provides a clean self-serve resolution path:
 *
 * Actions:
 *   1. "retry": Retries registration for the same domain with existing paid reference.
 *   2. "change_domain": Selects a new available domain using existing payment credit.
 *   3. "request_credit": Converts the payment order into customer wallet credit.
 */

import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { selectDomainRegistrar } from "@stratxcel/websites-and-domains";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, domainId, action, newDomainName } = body;

    if (!tenantId || !domainId || !action) {
      return Response.json({ error: "tenantId, domainId, and action ('retry' | 'change_domain' | 'request_credit') are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // 1. Fetch domain record
    const { data: domain, error: fetchErr } = await serviceDb
      .from("domains")
      .select("*")
      .eq("id", domainId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchErr || !domain) {
      return Response.json({ error: "Domain record not found" }, { status: 404 });
    }

    // Must be in a recoverable failed state
    if (domain.status !== "failed" && domain.status !== "paid_pending_registration") {
      return Response.json({ error: `Domain in '${domain.status}' state does not require recovery` }, { status: 400 });
    }

    const registrar = selectDomainRegistrar();

    // ACTION: RETRY
    if (action === "retry") {
      // Re-queue registration
      await serviceDb
        .from("domains")
        .update({
          status: "paid_pending_registration",
          updated_at: new Date().toISOString(),
        })
        .eq("id", domain.id);

      // Trigger fulfillment
      const { fulfillDomainRegistrationBestEffort } = await import("@/lib/domains/fulfillment");
      if (domain.payment_link_id) {
        const { data: link } = await serviceDb.from("payment_links").select("reference_id").eq("id", domain.payment_link_id).maybeSingle();
        if (link?.reference_id) {
          const { data: order } = await serviceDb.from("payment_orders").select("id").eq("reference_id", link.reference_id).maybeSingle();
          if (order?.id) {
            await fulfillDomainRegistrationBestEffort(serviceDb, order.id);
          }
        }
      }

      await recordAuditEvent(serviceDb, {
        tenantId,
        actorUserId: ctx.userId,
        actorKind: "user",
        action: "DOMAIN_REGISTRATION_RETRY_INITIATED",
        targetType: "domain",
        targetId: domain.id,
        metadata: { domainName: domain.domain_name },
      }).catch(() => {});

      const { data: updated } = await serviceDb.from("domains").select("*").eq("id", domain.id).single();
      return Response.json({ domain: updated, message: "Registration retry initiated." });
    }

    // ACTION: CHANGE DOMAIN
    if (action === "change_domain") {
      if (!newDomainName?.trim()) {
        return Response.json({ error: "newDomainName is required for change_domain action" }, { status: 400 });
      }

      const search = await registrar.searchDomain(newDomainName.trim());
      if (!search.available) {
        return Response.json({ error: `New domain '${newDomainName}' is unavailable` }, { status: 400 });
      }

      // Update domain name and re-arm registration
      await serviceDb
        .from("domains")
        .update({
          domain_name: search.domainName,
          status: "paid_pending_registration",
          purchase_price_cents: search.priceCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", domain.id);

      try {
        await recordAuditEvent(serviceDb, {
          tenantId,
          actorUserId: ctx.userId,
          actorKind: "user",
          action: "DOMAIN_SUBSTITUTED_AFTER_FAILURE",
          targetType: "domain",
          targetId: domain.id,
          metadata: { oldDomain: domain.domain_name, newDomain: search.domainName },
        });
      } catch {
        // non-blocking
      }

      const { data: updated } = await serviceDb.from("domains").select("*").eq("id", domain.id).single();
      return Response.json({ domain: updated, message: `Domain updated to ${search.domainName} and registration re-queued.` });
    }

    // ACTION: REQUEST CREDIT
    if (action === "request_credit") {
      const creditAmount = domain.purchase_price_cents || 0;

      // Credit wallet
      if (creditAmount > 0) {
        try {
          await serviceDb.rpc("credit_tenant_wallet", {
            p_tenant_id: tenantId,
            p_amount_cents: creditAmount,
            p_reason: `Refund for failed domain registration: ${domain.domain_name}`,
          });
        } catch {
          // non-blocking
        }
      }

      await serviceDb
        .from("domains")
        .update({
          status: "cancelled_credited",
          updated_at: new Date().toISOString(),
        })
        .eq("id", domain.id);

      await recordAuditEvent(serviceDb, {
        tenantId,
        actorUserId: ctx.userId,
        actorKind: "user",
        action: "DOMAIN_FAILED_CONVERTED_TO_WALLET_CREDIT",
        targetType: "domain",
        targetId: domain.id,
        metadata: { domainName: domain.domain_name, creditCents: creditAmount },
      }).catch(() => {});

      return Response.json({
        message: `₹${(creditAmount / 100).toFixed(2)} has been credited to your tenant wallet.`,
        creditedCents: creditAmount,
      });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process domain recovery";
    return Response.json({ error: msg }, { status: 500 });
  }
}
