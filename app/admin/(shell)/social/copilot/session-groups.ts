import type { AgentSessionRow } from "@/lib/social/repositories/agent";

export type SessionGroupLabel = "Today" | "Yesterday" | "This week" | "Older";

const GROUP_ORDER: SessionGroupLabel[] = ["Today", "Yesterday", "This week", "Older"];

/** Groups collapsed by default unless they contain the active session — see groupSessionsByRecency. */
export const DEFAULT_OPEN_GROUPS: SessionGroupLabel[] = ["Today"];

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Buckets sessions into TODAY / YESTERDAY / THIS WEEK / OLDER (in that
 * order, empty groups omitted) instead of one exact-calendar-day group per
 * day — a session list spanning weeks would otherwise render dozens of
 * single-session groups instead of a small, scannable set.
 */
export function groupSessionsByRecency(
  sessions: AgentSessionRow[],
  now: Date = new Date()
): Array<{ label: SessionGroupLabel; sessions: AgentSessionRow[] }> {
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  const weekAgoMs = now.getTime() - 7 * 86_400_000;

  const buckets: Record<SessionGroupLabel, AgentSessionRow[]> = { Today: [], Yesterday: [], "This week": [], Older: [] };
  for (const session of sessions) {
    const key = dayKey(session.updated_at);
    if (key === today) buckets.Today.push(session);
    else if (key === yesterday) buckets.Yesterday.push(session);
    else if (new Date(session.updated_at).getTime() >= weekAgoMs) buckets["This week"].push(session);
    else buckets.Older.push(session);
  }

  return GROUP_ORDER.map((label) => ({ label, sessions: buckets[label] })).filter((group) => group.sessions.length > 0);
}

/** Default-open state per Section 2 of the workspace repair brief: TODAY open,
 *  everything else collapsed UNLESS it contains the active session. */
export function defaultOpenGroups(
  groups: Array<{ label: SessionGroupLabel; sessions: AgentSessionRow[] }>,
  activeId: string | null
): Set<SessionGroupLabel> {
  const open = new Set<SessionGroupLabel>(DEFAULT_OPEN_GROUPS);
  if (activeId) {
    const owner = groups.find((group) => group.sessions.some((session) => session.id === activeId));
    if (owner) open.add(owner.label);
  }
  return open;
}
