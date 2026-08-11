/**
 * Scoped supersession of PROPOSED actions when a new review revision becomes active.
 * Never deletes history. Unrelated session actions are left alone.
 */

export interface SupersedableAction {
  id: string;
  status: string;
  tool_name: string;
  input: Record<string, unknown>;
}

export interface SupersessionScope {
  reviewId: string;
  revision: number;
  /** Optional content master / planned unit scope. */
  contentMasterId?: string | null;
  missionId?: string | null;
}

const PUBLISH_TOOLS = new Set(["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"]);

export function actionMatchesReviewScope(action: SupersedableAction, scope: SupersessionScope): boolean {
  const input = action.input ?? {};
  const reviewId = typeof input.reviewId === "string" ? input.reviewId : null;
  const revision = typeof input.revision === "number" ? input.revision : Number(input.revision);
  const masterId = typeof input.masterId === "string" ? input.masterId : typeof input.contentMasterId === "string" ? input.contentMasterId : null;
  const missionId = typeof input.missionId === "string" ? input.missionId : null;

  if (reviewId && reviewId === scope.reviewId) {
    // Same review family, older or equal revision that is being replaced
    if (!Number.isFinite(revision)) return true;
    return revision < scope.revision;
  }

  // Fallback scope: same master + publish tool without review metadata (legacy rows)
  if (scope.contentMasterId && masterId && masterId === scope.contentMasterId && PUBLISH_TOOLS.has(action.tool_name)) {
    return true;
  }

  if (scope.missionId && missionId && missionId === scope.missionId && PUBLISH_TOOLS.has(action.tool_name)) {
    if (reviewId && reviewId !== scope.reviewId) return false;
    return true;
  }

  return false;
}

/**
 * Select PROPOSED actions that must become SUPERSEDED when activating `next`.
 * Concurrent safety: callers must persist SUPERSEDED then insert new PROPOSED
 * under the same reviewId with a monotonically increasing revision.
 */
export function selectActionsToSupersede(
  actions: readonly SupersedableAction[],
  next: SupersessionScope,
): string[] {
  return actions
    .filter((action) => action.status === "PROPOSED")
    .filter((action) => PUBLISH_TOOLS.has(action.tool_name) || action.tool_name === "create_content_variant")
    .filter((action) => actionMatchesReviewScope(action, next))
    .map((action) => action.id);
}

export function applySupersession(
  actions: readonly SupersedableAction[],
  next: SupersessionScope,
): Array<SupersedableAction & { status: string }> {
  const ids = new Set(selectActionsToSupersede(actions, next));
  return actions.map((action) =>
    ids.has(action.id) ? { ...action, status: "SUPERSEDED" } : { ...action },
  );
}

export function countActiveProposed(actions: readonly SupersedableAction[], reviewId?: string): number {
  return actions.filter((action) => {
    if (action.status !== "PROPOSED") return false;
    if (!reviewId) return true;
    return action.input?.reviewId === reviewId;
  }).length;
}

/** SUPERSEDED (and non-PROPOSED) actions must never be claimable/executable. */
export function isClaimableProposedStatus(status: string): boolean {
  return status === "PROPOSED";
}
