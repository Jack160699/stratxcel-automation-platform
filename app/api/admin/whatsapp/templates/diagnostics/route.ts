import { requireOwnerContext } from "@/lib/social/db-context";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getMetaGraphApiVersion,
  inspectMetaTemplateEndpoint,
  MetaTemplateEndpointError,
  resolvePlatformWhatsAppSender,
} from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only, owner-authenticated diagnostics for the platform WhatsApp
 * template catalog. The access token and request authorization header are
 * never returned or logged.
 */
export async function GET(request: Request) {
  const owner = await requireOwnerContext();
  if (!owner.ok) return Response.json({ responseMessage: owner.error }, { status: owner.status });
  const requestedVersion = new URL(request.url).searchParams.get("apiVersion")?.trim();
  if (requestedVersion && !/^v\d+\.\d+$/.test(requestedVersion)) {
    return Response.json({ responseMessage: "Invalid Meta Graph API version" }, { status: 400 });
  }
  const diagnosticVersion = requestedVersion || getMetaGraphApiVersion();

  const { supabase } = getTenantServiceContext();
  const platformSender = await resolvePlatformWhatsAppSender(supabase);
  if (!platformSender.ok) {
    return Response.json(
      {
        wabaId: null,
        apiVersion: diagnosticVersion,
        httpStatus: 409,
        errorCode: null,
        responseMessage: "Stratxcel platform WhatsApp sender is not configured",
        objectId: null,
        objectName: null,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const inspection = await inspectMetaTemplateEndpoint({
      wabaId: platformSender.sender.wabaId,
      phoneNumberId: platformSender.sender.phoneNumberId,
      apiVersion: requestedVersion,
    });
    return Response.json(
      {
        wabaId: inspection.resolvedWabaId,
        apiVersion: inspection.apiVersion,
        diagnostics: inspection.diagnostics,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MetaTemplateEndpointError) {
      return Response.json(
        {
          wabaId: platformSender.sender.wabaId,
          apiVersion: diagnosticVersion,
          httpStatus: error.httpStatus,
          errorCode: error.errorCode,
          responseMessage: error.message,
          objectId: error.diagnostics[0]?.objectId ?? null,
          objectName: error.diagnostics[0]?.objectName ?? null,
          diagnostics: error.diagnostics,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        wabaId: platformSender.sender.wabaId,
        apiVersion: diagnosticVersion,
        httpStatus: 500,
        errorCode: null,
        responseMessage: error instanceof Error ? error.message : "Meta diagnostics failed",
        objectId: null,
        objectName: null,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

