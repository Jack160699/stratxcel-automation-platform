import { requireOwnerContext } from "@/lib/social/db-context";
import { getReportingConnectionsStatus } from "@/lib/reporting/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reporting connection health for the admin console. Owner-gated like every
 * other social-scoped surface (lib/social/db-context.ts): which providers a
 * workspace has connected, and which scopes it is missing, is not public
 * information. Reads run on the authenticated session client so RLS scopes
 * social_accounts to the caller; the service-role client is never used here.
 *
 * The response carries enum states and scope names only — no tokens.
 */
export async function GET() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const providers = await getReportingConnectionsStatus(ctx.supabase);

  return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}
