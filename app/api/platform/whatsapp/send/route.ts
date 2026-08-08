import crypto from "node:crypto";
import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { sendOutboundWhatsAppMessage } from "@/lib/whatsapp/send-outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only route that can trigger a real outbound WhatsApp send — every
 * safety check (consent, template requirement, kill switch, automation
 * mode, idempotency) lives in sendOutboundWhatsAppMessage, not here. A
 * caller-supplied idempotencyKey is accepted (e.g. so a client retry after
 * a network timeout can't double-send) but defaulting to a fresh UUID keeps
 * a plain "send" call from ever needing one.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, leadId, text, idempotencyKey, templateId, templateName, templateLanguage, templateParams } = body as {
    tenantId?: string;
    leadId?: string;
    text?: string;
    idempotencyKey?: string;
    templateId?: string;
    templateName?: string;
    templateLanguage?: string;
    templateParams?: string[];
  };

  if (!tenantId || !leadId || !text) {
    return Response.json({ error: "tenantId, leadId, and text are required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "whatsapp:send");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const outcome = await sendOutboundWhatsAppMessage(supabase, {
    tenantId,
    leadId,
    body: text,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    templateId,
    templateName,
    templateLanguage,
    templateParams,
    isHumanInitiated: true,
  });

  if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 400 });
  return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
