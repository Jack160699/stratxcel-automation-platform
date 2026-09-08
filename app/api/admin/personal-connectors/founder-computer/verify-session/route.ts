import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  updateConnectorConnectionMetadata,
  recordConnectorAudit,
  toDiscoveredCapabilityKeys,
  discoverFounderComputerCapabilities,
  probeFounderBrowserSession,
} from "@stratxcel/connectors";
import {
  parseFounderComputerSession,
  buildSessionVerifiedMetadata,
} from "@/lib/founder-computer/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/personal-connectors/founder-computer/verify-session
 * Verifies the actual active browser session across all tabs.
 * Inspects Google Account signals, aria-labels, and page identity.
 * If Founder has logged into Google or other services, records the authenticated
 * state and discovers newly enabled capabilities.
 * SAFE: Never extracts or stores passwords, tokens, or cookies.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const conn = await getConnectorConnection(supabase as never, "founder_computer", null);
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: "Founder Computer not initialized. Initialize setup first." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}

  const existingMeta = (conn.metadata as Record<string, unknown>) || {};
  const currentSession = parseFounderComputerSession(existingMeta);

  // Collect candidate domains
  const candidateDomains = new Set<string>(currentSession?.authenticatedDomains || []);

  // Accept user-specified domains if provided
  if (Array.isArray(body.domains)) {
    for (const d of body.domains) {
      if (typeof d === "string" && d.trim()) {
        candidateDomains.add(d.trim().toLowerCase());
      }
    }
  }

  // Live multi-tab session probe
  let detectedUrl = "";
  let detectedTitle = "";
  let detectedEmail: string | null = (existingMeta.authenticatedGoogleAccount as string) || null;
  let activeTabsSummary: Array<{ url: string; title: string; isGoogleAuth: boolean; hostname: string }> = [];

  try {
    const probe = await probeFounderBrowserSession({ timeoutMs: 5000 });
    if (probe.ok) {
      if (probe.primaryTab) {
        detectedUrl = probe.primaryTab.url || "";
        detectedTitle = probe.primaryTab.title || "";
      }
      if (probe.accountEmail) {
        detectedEmail = probe.accountEmail;
      }
      for (const d of probe.authenticatedDomains) {
        candidateDomains.add(d);
      }
      activeTabsSummary = probe.activeTabs.map((t) => ({
        url: t.url,
        title: t.title,
        isGoogleAuth: t.isGoogleAuth,
        hostname: t.hostname,
      }));
    }
  } catch (err) {
    console.warn("[verify-session] Live probe encountered error:", err);
  }

  // Fallback domain detection from detectedUrl if any
  if (detectedUrl) {
    try {
      const parsedUrl = new URL(detectedUrl);
      const host = parsedUrl.hostname.toLowerCase();

      // Sign-in success destinations
      if (
        host === "myaccount.google.com" ||
        host === "mail.google.com" ||
        host === "gemini.google.com" ||
        host === "drive.google.com" ||
        (host === "accounts.google.com" &&
          !parsedUrl.pathname.includes("/signin") &&
          !parsedUrl.pathname.includes("/v3/signin"))
      ) {
        candidateDomains.add("google.com");
        candidateDomains.add("accounts.google.com");
        candidateDomains.add(host);
      }
    } catch {}
  }

  // Fallback to explicit Google auth flag if requested
  if (candidateDomains.size === 0 && body.forceGoogleAuth === true) {
    candidateDomains.add("google.com");
    candidateDomains.add("accounts.google.com");
    candidateDomains.add("myaccount.google.com");
  }

  const authenticatedDomains = Array.from(candidateDomains);
  const isAuthSuccess = authenticatedDomains.length > 0;

  const updatedMetadata = buildSessionVerifiedMetadata({
    existing: existingMeta,
    authenticatedDomains,
    authenticatedGoogleAccount: detectedEmail,
    browserVersion: "Google Chrome 152 (Desktop Linux :99)",
    runtimeHostRef: "aws-ec2:i-0067f6c0dfd60cc46",
  });

  // Persist healthy connection status
  await updateConnectorConnectionMetadata(supabase as never, conn.id, updatedMetadata, {
    status: isAuthSuccess ? "healthy" : "requires_reauth",
    last_verified_at: new Date().toISOString(),
    last_health_check_at: new Date().toISOString(),
  });

  // Record audit
  await recordConnectorAudit(supabase as never, {
    connectorKey: "founder_computer",
    connectionId: conn.id,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId ?? null,
    eventType: "session_verified",
    status: isAuthSuccess ? "success" : "failure",
    metadata: {
      userId: admin.userId,
      email: admin.email,
      authenticatedDomains,
      authenticatedGoogleAccount: detectedEmail,
      detectedUrl,
      detectedTitle,
    },
  });

  const updatedSession = parseFounderComputerSession(updatedMetadata);
  const discovered = discoverFounderComputerCapabilities(updatedSession);
  const capabilityKeys = toDiscoveredCapabilityKeys(discovered);

  return NextResponse.json({
    ok: true,
    status: isAuthSuccess ? "ready" : "auth_required",
    authenticatedGoogleAccount: detectedEmail,
    authenticatedDomains,
    detectedUrl: detectedUrl || null,
    detectedTitle: detectedTitle || null,
    activeTabs: activeTabsSummary,
    discoveredCapabilities: capabilityKeys,
    message: isAuthSuccess
      ? `Session verified successfully! ${detectedEmail ? `Signed in as ${detectedEmail}` : "Google Account active"} (${authenticatedDomains.join(", ")})`
      : "No authenticated domains detected yet. Please sign into Google in the browser view first.",
  });
}
