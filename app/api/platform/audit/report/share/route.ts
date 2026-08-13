import { ownedCompletedAudit } from "../_owned";
import { createAuditShareUrl } from "@/lib/audit/v1/whatsapp-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const url = await createAuditShareUrl(ctx.service, {
    tenantId: ctx.tenantId,
    orderId: ctx.order.id as string,
    userId: ctx.user.id,
  });
  return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
}
