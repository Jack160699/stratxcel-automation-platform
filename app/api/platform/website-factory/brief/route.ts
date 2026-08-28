/**
 * Customer-Facing Website Factory Brief API
 *
 * POST /api/platform/website-factory/brief
 *   Accepts customer conversational prompt, returns questions or structured brief.
 */

import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { getCurrentBrandBrain, getCanonicalBrandContext } from "@stratxcel/brand-brain";
import {
  websiteBriefEngine,
  smartWebsiteCreatorController,
  type CustomerAnswer,
  type AuthorizedConnectorContext,
} from "@stratxcel/websites-and-domains";

/**
 * Brand Brain Final UX + Data + Save System Section 7: connectorContext
 * used to come ENTIRELY from the client request body -- the server never
 * verified or even fetched the tenant's real Brand Brain itself, so
 * Website's brand awareness depended entirely on whatever the calling
 * page happened to assemble client-side (and until this mission, that
 * client assembly didn't even forward services -- see
 * app/app/website/create/page.tsx). This builds the authoritative
 * server-side context from the same canonical retrieval layer every other
 * real consumer (image-generation, Social Autopilot, the workforce
 * brand-context compiler) now uses, and merges it UNDER whatever the
 * client sent -- client-supplied fields win when both are present (e.g. a
 * conversational answer the customer just typed in this exact session),
 * but a real saved service/business fact is never silently missing just
 * because the calling page forgot to forward it.
 */
async function buildServerAuthoritativeConnectorContext(
  supabase: unknown,
  tenantId: string,
  clientContext: AuthorizedConnectorContext | undefined
): Promise<AuthorizedConnectorContext> {
  const brandBrain = await getCurrentBrandBrain(supabase as never, tenantId).catch(() => null);
  const canonical = getCanonicalBrandContext(brandBrain?.content);
  const merged: AuthorizedConnectorContext = { ...clientContext };
  merged.brandBrain = {
    businessName: canonical.businessName || undefined,
    industry: canonical.industry ?? undefined,
    story: canonical.description ?? undefined,
    brandVoice: canonical.toneOfVoice ?? undefined,
    primaryColors: canonical.colors.length ? canonical.colors : undefined,
    logoUrl: canonical.logoUrl ?? undefined,
    ...clientContext?.brandBrain,
  };
  if (canonical.services.length || clientContext?.catalog) {
    merged.catalog = {
      existingServices: canonical.services.map((s) => ({ title: s.name })),
      ...clientContext?.catalog,
    };
  }
  return merged;
}

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
      const authoritativeContext = await buildServerAuthoritativeConnectorContext(
        ctx.supabase,
        tenantId,
        connectorContext as AuthorizedConnectorContext | undefined
      );
      const result = await websiteBriefEngine.processCustomerInput({
        tenantId,
        projectId,
        message,
        answers: (answers as CustomerAnswer[]) || [],
        connectorContext: authoritativeContext,
      });

      return Response.json({ ok: true, result });
    }

    return Response.json({ error: "message or regeneration action required" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}
