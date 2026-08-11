/**
 * Scoped supersession of PROPOSED actions when a new review revision becomes active.
 * Never deletes history. Unrelated session reviews are left alone.
 */

export interface SupersedableAction {
  id: string;
  status: string;
  tool_name: string;
  input: Record<string, unknown>;
}

export interface SupersessionScope {
  /** Stable review family id (does NOT change across revisions). */
  reviewId: string;
  /** Next revision being activated; older PROPOSED rows in this family are superseded. */
  revision: number;
  /** Optional content master / planned unit scope for legacy rows without reviewId. */
  contentMasterId?: string | null;
}

const PUBLISH_TOOLS = new Set([
  "schedule_post",
  "execute_youtube_verification",
  "execute_private_youtube_verification",
]);

function reviewFamilyOf(action: SupersedableAction): string | null {
  const reviewId = action.input?.reviewId;
  return typeof reviewId === "string" && reviewId.trim() ? reviewId : null;
}

function revisionOf(action: SupersedableAction): number | null {
  const revision = typeof action.input?.revision === "number" ? action.input.revision : Number(action.input?.revision);
  return Number.isFinite(revision) ? revision : null;
}

function masterOf(action: SupersedableAction): string | null {
  const input = action.input ?? {};
  if (typeof input.contentMasterId === "string" && input.contentMasterId) return input.contentMasterId;
  if (typeof input.masterId === "string" && input.masterId) return input.masterId;
  return null;
}

/**
 * Match only the exact review family being replaced.
 * Legacy fallback: same contentMasterId when the action has no reviewId.
 * Never match solely on session/mission — unrelated reviews must survive.
 */
export function actionMatchesReviewScope(action: SupersedableAction, scope: SupersessionScope): boolean {
  const family = reviewFamilyOf(action);
  if (family) {
    if (family !== scope.reviewId) return false;
    const revision = revisionOf(action);
    if (revision === null) return true;
    return revision < scope.revision;
  }

  // Legacy rows without review metadata: only when master matches.
  if (scope.contentMasterId && masterOf(action) === scope.contentMasterId && PUBLISH_TOOLS.has(action.tool_name)) {
    return true;
  }

  return false;
}

/**
 * Select PROPOSED actions that must become SUPERSEDED when activating `next`.
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
  return actions.map((action) => (ids.has(action.id) ? { ...action, status: "SUPERSEDED" } : { ...action }));
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

/** Stable family id — same across revisions of one planned unit. */
export function reviewFamilyId(sessionId: string, contentMasterId?: string | null, familyKey?: string | null): string {
  if (familyKey?.trim()) return familyKey.trim();
  if (contentMasterId?.trim()) return `review_${sessionId}_${contentMasterId.trim()}`;
  return `review_${sessionId}_default`;
}
