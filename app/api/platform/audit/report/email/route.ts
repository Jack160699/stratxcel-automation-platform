import { ownedCompletedAudit } from "../_owned";
import { enqueueAuditDeliveredEmail, createPostgresEmailOutboxStore } from "@stratxcel/email-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const ctx = await ownedCompletedAudit();
    if ("error" in ctx) return ctx.error;
    const store = createPostgresEmailOutboxStore(ctx.service);
    const { data: prior } = await ctx.service
      .from("audit_delivery_events")
      .select("id")
      .eq("audit_order_id", ctx.order.id)
      .eq("channel", "email")
      .eq("detail", "initial")
      .limit(1)
      .maybeSingle();
    const result = await enqueueAuditDeliveredEmail(ctx.service, store, ctx.order, {
      idempotencyKey: prior
        ? `audit_delivered_resend:${ctx.order.id}:${new Date().toISOString()}`
        : `audit_delivered:${ctx.order.id}`,
    });
    await ctx.service.from("audit_delivery_events").insert({
      audit_order_id: ctx.order.id,
      tenant_id: ctx.tenantId,
      channel: "email",
      status: result?.enqueued ? "queued" : result?.duplicate ? "sent" : "failed",
      detail: prior ? "resend" : "initial",
    });
    return Response.json({ ok: true, duplicate: result?.duplicate === true, resent: Boolean(prior) });
  } catch (error) {
    console.error("audit email delivery failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not queue the report email." }, { status: 500 });
  }
}
