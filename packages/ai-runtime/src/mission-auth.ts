/**
 * Server-side mission authorization for AI attribution.
 * Tool/model-supplied UUIDs are never trusted without this check.
 */

export type MissionAuthorizationClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => unknown;
    };
  };
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MaybeSingleResult = PromiseLike<{
  data: { id?: string; tenant_id?: string } | null;
  error: { message?: string } | null;
}>;

/**
 * Resolve a real missions.id only after verifying tenant ownership.
 * Returns null for Social session IDs, synthetic IDs, or unverified candidates.
 */
export async function resolveAuthorizedMissionId(args: {
  authorizationClient: MissionAuthorizationClient;
  tenantId: string;
  candidateMissionId?: string | null;
}): Promise<string | null> {
  const candidate = args.candidateMissionId?.trim();
  if (!candidate) return null;
  if (candidate.startsWith("mission_") || candidate.startsWith("session_")) return null;
  if (!UUID_RE.test(candidate)) return null;

  try {
    let q: unknown = args.authorizationClient.from("missions").select("id,tenant_id");
    q = (q as { eq: (c: string, v: string) => unknown }).eq("id", candidate);
    q = (q as { eq: (c: string, v: string) => unknown }).eq("tenant_id", args.tenantId);
    const { data, error } = await (q as { maybeSingle: () => MaybeSingleResult }).maybeSingle();
    if (error || !data?.id) return null;
    if (String(data.tenant_id) !== args.tenantId) return null;
    return String(data.id);
  } catch {
    return null;
  }
}
