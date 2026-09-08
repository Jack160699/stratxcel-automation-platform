import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  updateConnectorConnectionMetadata,
  recordConnectorAudit,
} from "@stratxcel/connectors";
import {
  buildViewerSessionMetadata,
  parseFounderComputerSession,
} from "@/lib/founder-computer/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Derives the HMAC signing secret from SUPABASE_SERVICE_ROLE_KEY or explicit secret.
 */
function getDerivedViewerSecret(): string {
  const master =
    process.env.FOUNDER_VIEWER_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "stratxcel-local-dev-fallback-secret-key-32ch";
  return crypto.createHmac("sha256", master).update("stratxcel-founder-viewer-v1").digest("hex");
}

/**
 * POST /api/admin/personal-connectors/founder-computer/viewer-token
 * Generates a short-lived cryptographically signed token allowing the Founder
 * to attach their local browser to the remote Founder Browser stream.
 *
 * Sets controlLock to FOUNDER_CONTROL and logs an audit event.
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
      { ok: false, error: "Founder Computer connection record not initialized. Please initialize setup first." },
      { status: 400 }
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = 15 * 60; // 15 minutes
  const expSec = nowSec + ttlSec;
  const expiresAt = new Date(expSec * 1000).toISOString();

  // Create HMAC-SHA256 signed token
  const payload = {
    userId: admin.userId,
    email: admin.email,
    scope: "founder_browser_view",
    exp: expSec,
    iat: nowSec,
  };

  const secret = getDerivedViewerSecret();
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const token = `${payloadB64}.${signature}`;

  // Update session metadata to reflect active viewer and lock
  const existingMeta = (conn.metadata as Record<string, unknown>) || {};
  const updatedMeta = buildViewerSessionMetadata({
    existing: existingMeta,
    expiresAt,
  });

  await updateConnectorConnectionMetadata(supabase as never, conn.id, updatedMeta);

  // Record audit event
  await recordConnectorAudit(supabase as never, {
    connectorKey: "founder_computer",
    connectionId: conn.id,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId ?? null,
    eventType: "viewer_opened",
    status: "success",
    metadata: {
      userId: admin.userId,
      email: admin.email,
      expiresAt,
    },
  });

  // Determine stream endpoint (WSS on bot.stratxcel.ai for prod, or local ws)
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const streamHost = isProd ? "wss://bot.stratxcel.ai" : "ws://127.0.0.1:6080";
  const streamUrl = `${streamHost}/founder-browser-stream?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    ok: true,
    token,
    streamUrl,
    expiresAt,
    controlLock: "FOUNDER_CONTROL",
    message: "Viewer session authorized. Founder control acquired.",
  });
}
