import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  updateConnectorConnectionMetadata,
  recordConnectorAudit,
  getFounderComputerRuntimeStatus,
  probeFounderBrowserSession,
} from "@stratxcel/connectors";
import {
  parseFounderComputerSession,
  buildSessionVerifiedMetadata,
} from "@/lib/founder-computer/session";
import { discoverFounderComputerCapabilities, toDiscoveredCapabilityKeys } from "@/lib/founder-computer/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/founder-computer/session
 * Returns the current Founder Computer session state.
 * SAFE: Never returns raw cookies, tokens, or session credentials.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  if (!connection) {
    return NextResponse.json({
      status: "not_configured",
      session: null,
      message: "Founder Computer not set up. POST /setup to initialize.",
    });
  }

  const metadata = (connection.metadata as Record<string, unknown> | null) ?? null;
  const session = parseFounderComputerSession(metadata);
  const runtime = await getFounderComputerRuntimeStatus();

  // Return safe session summary — no raw tokens/cookies
  return NextResponse.json({
    connectionId: connection.id,
    status: session?.status ?? "not_configured",
    runtimeState: runtime.state,
    runtime,
    session: session
      ? {
          profileId: session.profileId,
          status: session.status,
          isHealthy: session.isHealthy,
          authenticatedDomains: session.authenticatedDomains,
          authenticatedGoogleAccount: session.authenticatedGoogleAccount ?? null,
          browserVersion: runtime.browserVersion ?? session.browserVersion,
          lastVerifiedAt: session.lastVerifiedAt,
          connectedAt: session.connectedAt,
          runtimeHostRef: session.runtimeHostRef,
        }
      : null,
  });
}

/**
 * POST /api/admin/personal-connectors/founder-computer/session
 * Updates the session state after the Founder manually authenticates.
 *
 * Expected body:
 * {
 *   action: "verify" | "mark_degraded" | "mark_expired"
 *   authenticatedDomains?: string[]   // domains Founder authenticated
 *   browserVersion?: string           // e.g. "Chromium 120"
 *   runtimeHostRef?: string           // e.g. EC2 instance ID
 * }
 *
 * NO password or credential fields are accepted.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "verify";

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  if (!connection) {
    return NextResponse.json(
      { error: "Founder Computer not initialized. POST /setup first." },
      { status: 404 }
    );
  }

  const existing = (connection.metadata as Record<string, unknown> | null) ?? {};

  if (action === "verify") {
    let authenticatedDomains = Array.isArray(body.authenticatedDomains)
      ? (body.authenticatedDomains as string[]).filter((d) => typeof d === "string").slice(0, 50)
      : (parseFounderComputerSession(existing)?.authenticatedDomains ?? []);

    let authenticatedGoogleAccount =
      typeof body.authenticatedGoogleAccount === "string" && body.authenticatedGoogleAccount.includes("@")
        ? body.authenticatedGoogleAccount
        : (existing.authenticatedGoogleAccount as string) || null;

    // Auto-probe live runtime if domains are not manually provided
    if (authenticatedDomains.length === 0) {
      try {
        const probe = await probeFounderBrowserSession({ timeoutMs: 4000 });
        if (probe.ok && probe.authenticated) {
          authenticatedDomains = probe.authenticatedDomains;
          if (probe.accountEmail) {
            authenticatedGoogleAccount = probe.accountEmail;
          }
        }
      } catch {}
    }

    const browserVersion =
      typeof body.browserVersion === "string" ? body.browserVersion : null;
    const runtimeHostRef =
      typeof body.runtimeHostRef === "string" ? body.runtimeHostRef : null;

    const updatedMetadata = buildSessionVerifiedMetadata({
      existing,
      authenticatedDomains,
      authenticatedGoogleAccount,
      browserVersion,
      runtimeHostRef,
    });

    await updateConnectorConnectionMetadata(supabase as never, connection.id, updatedMetadata, {
      status: "healthy",
      last_verified_at: new Date().toISOString(),
      last_health_check_at: new Date().toISOString(),
    });

    await recordConnectorAudit(supabase as never, {
      connectorKey: "founder_computer",
      connectionId: connection.id,
      tenantId: null,
      actorKind: "founder",
      actorId: admin.userId ?? null,
      eventType: "session_authenticated",
      capabilityKey: null,
      executionMethod: null,
      status: "success",
      metadata: {
        authenticatedDomains,
        browserVersion: browserVersion ?? "unknown",
        runtimeHostRef: runtimeHostRef ?? null,
        verifiedBy: admin.email ?? "founder",
      },
    });

    const session = parseFounderComputerSession(updatedMetadata);
    const discoveredCapabilities = discoverFounderComputerCapabilities(session);
    const capabilityKeys = toDiscoveredCapabilityKeys(discoveredCapabilities);

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      status: "ready",
      profileId: session?.profileId ?? null,
      authenticatedDomains,
      discoveredCapabilities: capabilityKeys,
      message: "Session verified successfully. Founder Computer is ready.",
    });
  }

  if (action === "mark_expired") {
    const updatedMetadata = { ...existing, sessionStatus: "expired" };
    await updateConnectorConnectionMetadata(supabase as never, connection.id, updatedMetadata, {
      status: "requires_reauth",
    });

    await recordConnectorAudit(supabase as never, {
      connectorKey: "founder_computer",
      connectionId: connection.id,
      tenantId: null,
      actorKind: "system",
      actorId: null,
      eventType: "session_expired",
      capabilityKey: null,
      executionMethod: null,
      status: "failure",
      metadata: {},
    });

    return NextResponse.json({ success: true, status: "requires_reauth" });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

/**
 * DELETE /api/admin/personal-connectors/founder-computer/session
 * Disconnects the Founder Computer session.
 * Invalidates session state, writes audit event.
 * Does NOT delete the connection record — just resets to not_configured.
 */
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  if (!connection) {
    return NextResponse.json({ success: true, message: "No active session to disconnect." });
  }

  const disconnectedMetadata: Record<string, unknown> = {
    sessionStatus: "disconnected",
    authenticatedDomains: [],
    lastVerifiedAt: null,
    disconnectedAt: new Date().toISOString(),
    disconnectedBy: admin.userId ?? "founder",
  };

  await updateConnectorConnectionMetadata(supabase as never, connection.id, disconnectedMetadata, {
    status: "disabled",
    discovered_capabilities: [],
  });

  await recordConnectorAudit(supabase as never, {
    connectorKey: "founder_computer",
    connectionId: connection.id,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId ?? null,
    eventType: "disconnected",
    capabilityKey: null,
    executionMethod: null,
    status: "success",
    metadata: { disconnectedBy: admin.email ?? "founder" },
  });

  return NextResponse.json({ success: true, status: "disconnected" });
}
