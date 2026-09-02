/**
 * get_paid_audit_report_link: closes the real, precisely-recorded gap from
 * Update 21 (capability:paid_audit_pdf_report) -- the paid Audit product
 * (`audit_orders`, distinct from the free/prospect `public_audit_requests`
 * flow `check_audit_status` already covers) has a real, working report and a
 * real signed-URL sharing mechanism (`lib/audit/v1/whatsapp-send.ts`'s
 * `getOrCreateAuditShareUrl` / `createAuditShareUrl`, backed by the real
 * `audit_share_tokens` table and a real, already-built `/audit/share/[token]`
 * page -- token-hashed, 14-day expiry, revocable, view-counted). Update 21
 * found this exact mechanism already existed but was cookie-session-scoped
 * only (`app/api/platform/audit/report/share/route.ts`'s `ownedCompletedAudit`
 * reads the browser session), which a service-role WhatsApp/Admin agent call
 * has no access to -- and correctly refused to bridge it with a rushed
 * wrapper. This tool is that real bridge: it resolves the caller's own
 * current completed Audit order the same way `ownedCompletedAudit` does
 * (`resolveCurrentAuditOrderId`, with its own real fallback to the latest
 * completed order), but scoped by a resolved tenantId instead of a cookie
 * session -- then calls the exact same `getOrCreateAuditShareUrl` the
 * authenticated dashboard route calls, so a link handed out here is
 * pixel-for-pixel the same mechanism, not a second, competing one.
 *
 * Classified `low_mutation` (not `read`): the first call for a given order
 * mints a real, durable, 14-day bearer-token row in `audit_share_tokens`,
 * not just a read. Over WhatsApp that means confirm-gated
 * (`decideMutationPolicy`), correctly -- minting a shareable link to a
 * private business report is a real action worth a confirmation, not a
 * silent one.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { getOrCreateAuditShareUrl } from "@/lib/audit/v1/whatsapp-send";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? process.env.STRATXCEL_PLATFORM_TENANT_ID ?? null;
}

export const AUDIT_REPORT_LINK_TOOL: AgentTool = {
  schema: {
    name: "get_paid_audit_report_link",
    description:
      "Gets a real, shareable link to a tenant's current completed PAID Audit report (audit_orders -- the paid product, NOT the free public_audit_requests intake check_audit_status covers). Mints or reuses a real 14-day signed share link, the same mechanism the customer dashboard's own 'Share' button uses. Use for 'send me the audit report link', 'share our audit', 'where's the PDF of our audit'. Fails honestly if no completed paid Audit exists yet for this tenant.",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:audit_reports",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    if (!tenantId) return { outcome: "FAILED", reason: "no_tenant_resolved" };

    // Same resolution order ownedCompletedAudit uses: a real
    // tenant_current_audits pointer first, falling back to the latest
    // completed order only when that pointer is absent (undefined) --
    // never when it's explicitly null (an archived/cleared current audit).
    const currentOrderId = await resolveCurrentAuditOrderId(ctx.supabase as never, tenantId);
    let orderId: string | null;
    if (typeof currentOrderId === "string") {
      orderId = currentOrderId;
    } else if (currentOrderId === null) {
      orderId = null;
    } else {
      const fallbackSupabase = ctx.supabase as never as {
        from(table: string): {
          select(columns: string): {
            eq(column: string, value: string): {
              eq(column: string, value: string): {
                order(column: string, opts: { ascending: boolean }): {
                  limit(n: number): { maybeSingle(): Promise<{ data: { id: string } | null }> };
                };
              };
            };
          };
        };
      };
      const fallback = await fallbackSupabase
        .from("audit_orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      orderId = fallback.data?.id ?? null;
    }
    if (!orderId) return { outcome: "FAILED", reason: "no_current_audit" };

    const orderSupabase = ctx.supabase as never as {
      from(table: string): {
        select(columns: string): {
          eq(column: string, value: string): {
            eq(column: string, value: string): {
              maybeSingle(): Promise<{ data: { id: string; status: string; business_name: string | null } | null }>;
            };
          };
        };
      };
    };
    const { data: order } = await orderSupabase
      .from("audit_orders")
      .select("id, status, business_name")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!order) return { outcome: "FAILED", reason: "audit_order_not_found" };
    if (order.status !== "completed") return { outcome: "FAILED", reason: "audit_not_completed", status: order.status };

    try {
      const url = await getOrCreateAuditShareUrl(ctx.supabase as never, {
        tenantId,
        orderId,
        userId: ctx.principal.authUserId,
      });
      return { outcome: "AVAILABLE", url, businessName: order.business_name ?? null, expiresInDays: 14 };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "share_link_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "AVAILABLE") return null;
    return { status: "failed", detail: r?.reason };
  },
};
