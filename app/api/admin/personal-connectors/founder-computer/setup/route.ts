import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  createConnectorConnection,
  getConnectorConnection,
  updateConnectorConnectionMetadata,
  recordConnectorAudit,
  getFounderComputerRuntimeStatus,
} from "@stratxcel/connectors";
import {
  generateProfileId,
  buildInitialSessionMetadata,
  parseFounderComputerSession,
} from "@/lib/founder-computer/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/personal-connectors/founder-computer/setup
 * Control Plane setup endpoint for the Founder Computer connector session record.
 *
 * ARCHITECTURAL CONTRACT:
 * - Control Plane (Vercel): Creates/updates database connection record and profile identifier.
 *   Does NOT touch Vercel filesystem or spawn local Chrome instances.
 * - Runtime Host (AWS EC2 / Founder PC): Houses persistent Chrome profile directory
 *   (/var/lib/stratxcel/.stratxcel-founder-computer-profile) and runs CDP daemon.
 *
 * SECURITY:
 * - NO password storage or prompt.
 * - Never returns or logs secrets, tokens, or raw credentials.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const runtimeHostRef = typeof body.runtimeHostRef === "string" ? body.runtimeHostRef : "aws-ec2:i-0067f6c0dfd60cc46";

    const { supabase } = getTenantServiceContext();

    // Check runtime status
    const runtime = await getFounderComputerRuntimeStatus();
    const runtimeStatus = runtime.state === "RUNNING" ? "RUNNING" : "STOPPED";

    // Idempotent: Check if connection already exists
    const existing = await getConnectorConnection(supabase as never, "founder_computer", null);
    if (existing) {
      const existingSession = parseFounderComputerSession(existing.metadata as Record<string, unknown> | null);
      let profileId = existingSession?.profileId;

      if (!profileId) {
        // Partially initialized record: recover by generating profileId and storing metadata
        profileId = generateProfileId();
        const recoveredMetadata = buildInitialSessionMetadata({ profileId, runtimeHostRef });
        await updateConnectorConnectionMetadata(supabase as never, existing.id, recoveredMetadata);
      }

      const effectiveStatus = existing.status === "disabled" ? "pending" : (existing.status || "auth_required");

      return NextResponse.json({
        ok: true,
        status: effectiveStatus,
        runtimeStatus,
        profileId,
        setupState: "already_initialized",
        nextAction: runtimeStatus === "RUNNING" ? "verify_session" : "open_browser",
        connectionId: existing.id,
        message: "Founder Computer session already initialized. Profile registered.",
        error: null,
        setupInstructions: [
          "The browser runtime is persistent on AWS EC2 host (i-0067f6c0dfd60cc46).",
          "Navigate to accounts you want to authorize (e.g. accounts.google.com).",
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

    // New connection creation
    const profileId = generateProfileId();
    const metadata = buildInitialSessionMetadata({ profileId, runtimeHostRef });

    const connection = await createConnectorConnection(supabase as never, {
      connectorKey: "founder_computer",
      tenantId: null, // Founder personal scope
      rawSecret: null, // No secret at setup — session secret added after browser authentication
      connectedByUserId: admin.userId ?? null,
      metadata,
    });

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
      ok: true,
      status: "auth_required",
      runtimeStatus,
      profileId,
      setupState: "initialized",
      nextAction: runtimeStatus === "RUNNING" ? "verify_session" : "open_browser",
      connectionId: connection.id,
      message: "Founder Computer session initialized. Follow setup instructions to authenticate.",
      error: null,
      setupInstructions: [
        "The browser runtime is persistent on AWS EC2 host (i-0067f6c0dfd60cc46).",
        "Navigate to accounts you want to authorize (e.g. accounts.google.com).",
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
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Sanitize technical reason: scrub secrets, connection strings, or bearer tokens
    const technicalReason = rawMsg
      .replace(/(postgres:\/\/|Bearer\s+|key=)[^\s]+/gi, "[REDACTED]")
      .slice(0, 300);

    console.error("[FounderComputerSetup] Error:", technicalReason);

    return NextResponse.json(
      {
        ok: false,
        status: "error",
        runtimeStatus: "ERROR",
        profileId: null,
        setupState: "failed",
        nextAction: "retry",
        error: "Unable to initialize Founder Computer runtime.",
        technicalReason,
      },
      { status: 500 }
    );
  }
}
