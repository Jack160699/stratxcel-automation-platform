import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import {
  executeBrowserAction,
  executeComputerAction,
  recordConnectorAudit,
  createServiceClient,
  type ConnectorAuditEventType,
} from "@stratxcel/connectors";

export const dynamic = "force-dynamic";

/**
 * Maps a capability string to an audit event type.
 */
function resolveAuditEventType(capability: string, isSuccess: boolean): ConnectorAuditEventType {
  if (!isSuccess) return "execution_failed";
  const action = capability.replace(/^(browser|computer)\./, "");
  switch (action) {
    case "click":
      return "click";
    case "type":
      return "type";
    case "screenshot":
      return "screenshot";
    case "navigate":
      return "navigation";
    case "download":
      return "download";
    case "upload":
      return "upload";
    default:
      return "execution_completed";
  }
}

/**
 * POST /api/admin/personal-connectors/founder-computer/execute
 * Direct Founder Admin execution endpoint for testing browser and computer primitives.
 * Logs connector audit events and scrubs tokens/secrets from all outputs.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const capability = typeof body.capability === "string" ? body.capability : "";
  const payload = (body.payload as Record<string, unknown>) ?? {};

  if (!capability) {
    return NextResponse.json({ error: "Missing required 'capability' parameter" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Audit execution start
  await recordConnectorAudit(supabase, {
    connectorKey: "founder_computer",
    connectionId: null,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId,
    eventType: "execution_started",
    status: "success",
    metadata: { capability, payloadSummary: Object.keys(payload) },
  }).catch(() => {});

  let result: Record<string, unknown>;
  if (capability.startsWith("computer.")) {
    result = await executeComputerAction(capability, payload);
  } else {
    result = await executeBrowserAction(capability, payload);
  }

  const isSuccess = Boolean(result.success);

  // Audit execution completion or failure
  await recordConnectorAudit(supabase, {
    connectorKey: "founder_computer",
    connectionId: null,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId,
    eventType: resolveAuditEventType(capability, isSuccess),
    status: isSuccess ? "success" : "failure",
    metadata: {
      capability,
      success: isSuccess,
      action: result.action,
      error: result.error,
    },
  }).catch(() => {});

  return NextResponse.json(result);
}
