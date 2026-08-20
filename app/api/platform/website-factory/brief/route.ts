/**
 * Customer-Facing Website Factory Brief API
 *
 * POST /api/platform/website-factory/brief
 *   Accepts customer conversational prompt, returns questions or structured brief.
 */

import { requireTenantContext } from "@/lib/tenants/tenant-context";
import {
  websiteBriefEngine,
  smartWebsiteCreatorController,
  type CustomerAnswer,
  type AuthorizedConnectorContext,
} from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      tenantId,
      projectId,
      message,
      answers,
      connectorContext,
      action,
      savedState,
      regenerationOption,
    } = body;

    if (!tenantId) {
      return Response.json({ error: "tenantId is required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    // 1. Regeneration action
    if (action === "regenerate" && savedState && regenerationOption) {
      const regenerated = await smartWebsiteCreatorController.executeRegeneration(
        savedState,
        regenerationOption
      );
      return Response.json({ ok: true, state: regenerated });
    }

    // 2. Normal brief processing
    if (message) {
      const result = await websiteBriefEngine.processCustomerInput({
        tenantId,
        projectId,
        message,
        answers: (answers as CustomerAnswer[]) || [],
        connectorContext: connectorContext as AuthorizedConnectorContext,
      });

      return Response.json({ ok: true, result });
    }

    return Response.json({ error: "message or regeneration action required" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}
