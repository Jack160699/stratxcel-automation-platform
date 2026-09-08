import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createConnectorConnection, getConnectorConnection } from "@stratxcel/connectors";
import {
  generateProfileId,
  buildInitialSessionMetadata,
} from "@/lib/founder-computer/session";
import { recordConnectorAudit } from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/personal-connectors/founder-computer/setup
 * Initializes the Founder Computer connector session record.
 *
 * Does NOT ask for passwords or credentials.
 * Creates a connector_connection row with status=auth_required and
 * returns setup instructions for the Founder.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const runtimeHostRef = typeof body.runtimeHostRef === "string" ? body.runtimeHostRef : null;

  const { supabase } = getTenantServiceContext();

  // Check if a connection already exists — don't duplicate
  const existing = await getConnectorConnection(supabase as never, "founder_computer", null);
  if (existing) {
    return NextResponse.json({
      alreadyExists: true,
      connectionId: existing.id,
      status: existing.status,
      message: "Founder Computer session already initialized. Use /session to update or /health to verify.",
    });
  }

  const profileId = generateProfileId();
  const metadata = buildInitialSessionMetadata({ profileId, runtimeHostRef });

  const connection = await createConnectorConnection(supabase as never, {
    connectorKey: "founder_computer",
    tenantId: null, // Founder personal scope
    rawSecret: null, // No secret at setup — session secret added after browser authentication
    connectedByUserId: admin.userId ?? null,
  });

  // Update the connection with the session metadata
  await (supabase as ReturnType<typeof getTenantServiceContext>["supabase"])
    .from("connector_connections")
    .update({ metadata })
    .eq("id", connection.id);

  await recordConnectorAudit(supabase as never, {
    connectorKey: "founder_computer",
    connectionId: connection.id,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId ?? null,
    eventType: "connected",
    capabilityKey: null,
    executionMethod: null,
    status: "success",
    metadata: {
      profileId,
      runtimeHostRef,
      initiatedBy: admin.email ?? "founder",
    },
  });

  return NextResponse.json({
    connectionId: connection.id,
    profileId,
    status: "auth_required",
    message: "Founder Computer session initialized. Follow setup instructions to authenticate.",
    setupInstructions: [
      "The browser runtime must be running on the configured host.",
      "Navigate to the accounts you want to authorize (e.g. accounts.google.com).",
      "Complete sign-in manually — StratXcel never receives your password.",
      "Return to Admin and click 'Verify Session' to confirm the session is active.",
      "Click 'Discover Capabilities' to identify available services.",
    ],
    nextSteps: {
      verify: "POST /api/admin/personal-connectors/founder-computer/session",
      health: "GET /api/admin/personal-connectors/founder-computer/health",
      capabilities: "POST /api/admin/personal-connectors/founder-computer/capabilities",
    },
  });
}
