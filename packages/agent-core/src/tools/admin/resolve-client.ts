/**
 * Deterministic company/client name resolution — pure logic, zero I/O, so
 * it's testable without a database (see
 * packages/agent-core/src/__tests__/resolve-client-by-name.test.ts).
 *
 * WHY THIS EXISTS: every admin mutation tool that acts on a specific tenant
 * (create_mission, create_handoff, schedule_follow_up, ...) requires a real
 * tenantId argument. When a Founder/staff message names a business by name
 * ("my friend's solar company") rather than supplying an id, the model has
 * no safe way to produce that id itself — a wrong guess would write real
 * data (a mission, a CRM lead, a handoff) to the wrong real tenant, a
 * cross-tenant-contamination-shaped bug, not a cosmetic one. This function
 * is the real, non-LLM enforcement point: the MODEL never decides which
 * tenant a name maps to, this string match does, and it always returns
 * either one confident answer or an explicit set of candidates to
 * disambiguate with the user — never a "best guess."
 */

export interface ClientCandidate {
  id: string;
  slug: string;
  name: string;
}

export interface ClientNameMatch {
  tenantId: string;
  name: string;
  slug: string;
}

export type ClientNameMatchResult =
  | { status: "single_match"; tenantId: string; name: string; slug: string }
  | { status: "multiple_matches"; candidates: ClientNameMatch[] }
  | { status: "no_match" };

function toMatch(c: ClientCandidate): ClientNameMatch {
  return { tenantId: c.id, name: c.name, slug: c.slug };
}

/**
 * Case-insensitive: an exact match on name or slug wins outright over any
 * partial match (so "Stratxcel" resolves to the tenant named exactly
 * "Stratxcel" even if another tenant's name merely contains that
 * substring). Falls back to substring matching only when no exact match
 * exists. Multiple equally-good matches are returned as candidates, never
 * silently narrowed to one — the caller (the model, via its own next turn)
 * is expected to ask the user rather than guess.
 */
export function matchClientsByName(query: string, candidates: readonly ClientCandidate[]): ClientNameMatchResult {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { status: "no_match" };

  const exact = candidates.filter(
    (c) => c.name.trim().toLowerCase() === normalizedQuery || c.slug.trim().toLowerCase() === normalizedQuery
  );
  if (exact.length === 1) return { status: "single_match", ...toMatch(exact[0]) };
  if (exact.length > 1) return { status: "multiple_matches", candidates: exact.map(toMatch) };

  const partial = candidates.filter(
    (c) => c.name.toLowerCase().includes(normalizedQuery) || c.slug.toLowerCase().includes(normalizedQuery)
  );
  if (partial.length === 1) return { status: "single_match", ...toMatch(partial[0]) };
  if (partial.length > 1) return { status: "multiple_matches", candidates: partial.map(toMatch) };

  return { status: "no_match" };
}
