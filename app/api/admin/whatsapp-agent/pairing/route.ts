import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { createPairingChallenge } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated server route for STAFF pairing-code generation. Platform
 * staff are not scoped to any tenant (see platform_staff_users), so the
 * caller's identity is resolved directly from their Supabase session —
 * the same pattern already used by app/api/platform/tenants/route.ts for
 * tenant-independent authenticated reads — never through tenant
 * membership, and never trusted from request-body input.
 *
 * The plaintext code is returned exactly once, in this response, to the
 * authenticated caller. It is never persisted or logged — only its hash is
 * stored (see @stratxcel/agent-core's createPairingChallenge).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const staffAuth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase: serviceDb } = getTenantServiceContext();
  const challenge = await createPairingChallenge(serviceDb, {
    authUserId: user.id,
    principalType: "staff",
    tenantId: null,
  });

  return Response.json(
    { code: challenge.code, expiresAt: challenge.expiresAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
