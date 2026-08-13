import { ownedCompletedAudit } from "../_owned";
import { normalizeWhatsAppDestination } from "@/lib/audit/v1/e164";
import {
  loadAuditWhatsAppDestination,
  setAuditWhatsAppConsent,
  upsertAuditWhatsAppDestination,
} from "@/lib/audit/v1/whatsapp-destination";
import { getOrCreateAuditShareUrl, sendAuditReportWhatsApp } from "@/lib/audit/v1/whatsapp-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as {
    destination?: { countryIso?: string; nationalNumber?: string };
    consent?: boolean;
  };

  if (body.destination?.nationalNumber) {
    const normalized = normalizeWhatsAppDestination(body.destination.countryIso || "IN", body.destination.nationalNumber);
    if (!normalized) {
      return Response.json({ status: "NO_DESTINATION", message: "Enter a valid WhatsApp number." }, { status: 400 });
    }
    await upsertAuditWhatsAppDestination(ctx.service, {
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      destination: normalized,
      consent: body.consent === true,
      source: "audit_report_send",
    });
  } else if (body.consent === true) {
    const updated = await setAuditWhatsAppConsent(ctx.service, {
      tenantId: ctx.tenantId,
      consent: true,
      source: "audit_report_send",
    });
    if (!updated) {
      return Response.json({ status: "NO_DESTINATION", message: "Add your WhatsApp number to receive this Audit." });
    }
  } else {
    const existing = await loadAuditWhatsAppDestination(ctx.service, ctx.tenantId);
    if (!existing) {
      return Response.json({ status: "NO_DESTINATION", message: "Add your WhatsApp number to receive this Audit." });
    }
  }

  const { data: generation } = await ctx.service
    .from("audit_generation_runs")
    .select("quality_outcome, status")
    .eq("audit_order_id", ctx.order.id)
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reportUrl = await getOrCreateAuditShareUrl(ctx.service, {
    tenantId: ctx.tenantId,
    orderId: ctx.order.id as string,
    userId: ctx.user.id,
  });

  const result = await sendAuditReportWhatsApp(ctx.service, {
    tenantId: ctx.tenantId,
    orderId: ctx.order.id as string,
    businessName: (ctx.order.business_name as string | null) ?? null,
    reportUrl,
    qualityOutcome: typeof generation?.quality_outcome === "string" ? generation.quality_outcome : null,
  });

  const http =
    result.status === "SENT" || result.status === "DELIVERED"
      ? 200
      : result.status === "NO_DESTINATION" || result.status === "NO_CONSENT"
        ? 200
        : result.status === "SENDER_NOT_CONFIGURED" || result.status === "TEMPLATE_REQUIRED"
          ? 409
          : 400;
  return Response.json(result, { status: http, headers: { "Cache-Control": "no-store" } });
}
