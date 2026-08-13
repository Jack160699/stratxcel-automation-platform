import { createHash } from "node:crypto";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { normalizeAuditDeliveryReport } from "@/lib/audit/customer-state";

export const dynamic = "force-dynamic";

function shareExpired(expiresAt: string, nowMs: number): boolean {
  return Date.parse(expiresAt) < nowMs;
}

async function loadSharedAudit(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const service = getTenantServiceContext().supabase;
  const { data: share } = await service
    .from("audit_share_tokens")
    .select("id, audit_order_id, expires_at, revoked_at, view_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const nowMs = Date.now();
  if (!share || share.revoked_at || shareExpired(share.expires_at, nowMs)) {
    return null;
  }
  const { data: order } = await service.from("audit_orders").select("business_name, report_data, status").eq("id", share.audit_order_id).maybeSingle();
  const report = order?.status === "completed" ? normalizeAuditDeliveryReport(order.report_data) : null;
  if (!report) return null;
  await service.from("audit_share_tokens").update({ view_count: (share.view_count ?? 0) + 1 }).eq("id", share.id);
  return { businessName: order?.business_name as string | undefined, report };
}

export default async function SharedAuditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadSharedAudit(token);
  if (!shared) {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">This report link is no longer available</h1></main>;
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs uppercase tracking-[0.16em] text-sx-accent">Stratxcel Audit</p>
      <h1 className="mt-2 text-2xl font-semibold">{shared.businessName}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-sx-text-muted">{shared.report.executiveSummary}</p>
    </main>
  );
}
