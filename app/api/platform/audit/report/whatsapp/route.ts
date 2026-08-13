import { ownedCompletedAudit } from "../_owned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const deepDive = ctx.order.deep_dive_answers as Record<string, unknown> | null;
  const experience = deepDive?.v1Experience as { channels?: Array<{ type: string; value: string; notAvailable?: boolean }> } | undefined;
  const whatsapp = experience?.channels?.find((channel) => channel.type === "whatsapp" && channel.value && !channel.notAvailable);
  if (!whatsapp) {
    await ctx.service.from("audit_delivery_events").insert({
      audit_order_id: ctx.order.id,
      tenant_id: ctx.tenantId,
      channel: "whatsapp",
      status: "skipped",
      detail: "no_permitted_destination",
    });
    return Response.json({ message: "WhatsApp was not sent because no permitted destination is connected." });
  }

  const { data: consent } = await ctx.service
    .from("contact_consent")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("channel", "whatsapp")
    .eq("opted_in", true)
    .is("opted_out_at", null)
    .limit(1)
    .maybeSingle();

  if (!consent) {
    await ctx.service.from("audit_delivery_events").insert({
      audit_order_id: ctx.order.id,
      tenant_id: ctx.tenantId,
      channel: "whatsapp",
      status: "skipped",
      detail: "no_consent",
    });
    return Response.json({ message: "WhatsApp was not sent because marketing permission is not on file." });
  }

  await ctx.service.from("audit_delivery_events").insert({
    audit_order_id: ctx.order.id,
    tenant_id: ctx.tenantId,
    channel: "whatsapp",
    status: "queued",
    detail: "consent_destination_present",
  });
  return Response.json({ message: "WhatsApp completion message is queued for your connected number." });
}
