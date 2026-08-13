import { createHash, randomBytes } from "node:crypto";
import { ownedCompletedAudit } from "../_owned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await ctx.service.from("audit_share_tokens").insert({
    audit_order_id: ctx.order.id,
    tenant_id: ctx.tenantId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    created_by: ctx.user.id,
  });
  await ctx.service.from("audit_delivery_events").insert({
    audit_order_id: ctx.order.id,
    tenant_id: ctx.tenantId,
    channel: "share",
    status: "sent",
  });
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://www.stratxcel.in";
  return Response.json({ url: `${origin}/audit/share/${token}` });
}
