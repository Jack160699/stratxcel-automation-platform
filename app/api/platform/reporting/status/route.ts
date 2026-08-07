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
  let ctx: Awaited<ReturnType<typeof requireOwnerContext>>;
  try {
    ctx = await requireOwnerContext();
  } catch {
    // createSupabaseServerClient() throws outright when NEXT_PUBLIC_SUPABASE_URL
    // or the anon key is absent from the environment — the case on Preview
    // deployments, where those variables are not configured. Answer with a
    // named, unauthenticated 503 rather than an unhandled crash: the reason is
    // the deployment's configuration, not the caller's request. Nothing about
    // the environment is echoed back.
    return Response.json(
      { error: "Reporting status unavailable: authentication backend is not configured for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const providers = await getReportingConnectionsStatus(ctx.supabase);

  return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}
