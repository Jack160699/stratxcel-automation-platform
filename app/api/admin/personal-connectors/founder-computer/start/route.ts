import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import {
  startFounderBrowser,
  getFounderComputerRuntimeStatus,
  listActiveTabs,
} from "@stratxcel/connectors";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/founder-computer/start
 * Returns the current Founder Browser runtime state and active tabs.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const status = await getFounderComputerRuntimeStatus();
  const tabs = status.state === "RUNNING" ? await listActiveTabs() : [];

  return NextResponse.json({
    status: status.state,
    runtime: status,
    tabs,
  });
}

/**
 * POST /api/admin/personal-connectors/founder-computer/start
 * Actually starts the Founder Browser process or connects to an existing instance.
 * Preserves the persistent profile directory so logins and cookies are never lost.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}

  const startUrl = typeof body.startUrl === "string" ? body.startUrl : undefined;
  const headless = typeof body.headless === "boolean" ? body.headless : undefined;

  const result = await startFounderBrowser({ startUrl, headless });
  const tabs = result.state === "RUNNING" ? await listActiveTabs() : [];

  return NextResponse.json({
    success: result.state === "RUNNING",
    status: result.state,
    runtime: result,
    tabs,
  });
}
