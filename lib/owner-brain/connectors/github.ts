import { ingestEvent } from "../repositories/events";
import { getStoredSecret } from "./token-access";
import { mapGitHubEventType as mapEventType } from "./pure";
import type { SyncFn } from "./types";

export { mapEventType };

interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

/**
 * GET /users/{login}/events with the owner's own token shows private
 * activity too (per GitHub's docs: authenticated as the given user ->
 * private events included). No per-repo config needed. Only structural
 * fields are stored (repo name, action, commit count) — never commit
 * messages, diffs, or issue/PR body text.
 */
export const syncGitHub: SyncFn = async ({ ownerId, sourceId, connectionId, cursor }) => {
  const token = await getStoredSecret(connectionId!);
  const sinceIso = typeof cursor.sinceIso === "string" ? cursor.sinceIso : new Date(0).toISOString();

  const meRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
  if (!meRes.ok) throw new Error(`GitHub /user failed: HTTP ${meRes.status}`);
  const me = (await meRes.json()) as { login: string };

  const eventsRes = await fetch(`https://api.github.com/users/${me.login}/events?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!eventsRes.ok) throw new Error(`GitHub events failed: HTTP ${eventsRes.status}`);
  const events = (await eventsRes.json()) as GitHubEvent[];

  let ingested = 0;
  let latest = sinceIso;
  for (const event of events) {
    if (event.created_at <= sinceIso) continue;
    const eventType = mapEventType(event.type);
    if (!eventType) continue;

    const payload: Record<string, unknown> = { repo: event.repo.name, githubEventType: event.type };
    if (event.type === "PushEvent") payload.commitCount = (event.payload.commits as unknown[] | undefined)?.length ?? 0;
    if (event.type === "PullRequestEvent") payload.action = event.payload.action;
    if (event.type === "IssuesEvent" || event.type === "IssueCommentEvent") payload.action = event.payload.action;

    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: event.id,
      eventType,
      occurredAt: event.created_at,
      payload,
    });
    if (inserted) ingested += 1;
    if (event.created_at > latest) latest = event.created_at;
  }

  return { eventsIngested: ingested, nextCursor: { sinceIso: latest } };
};

export async function verifyGitHubToken(token: string): Promise<boolean> {
  const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}
