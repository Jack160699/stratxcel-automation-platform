import type { AgentSessionRow } from "@/lib/social/repositories/agent";

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function groupSessionsByDay(sessions: AgentSessionRow[]): Array<{ label: string; sessions: AgentSessionRow[] }> {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());

  const groups = new Map<string, AgentSessionRow[]>();
  for (const session of sessions) {
    const key = dayKey(session.updated_at);
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, list]) => ({
      label: key === today ? "Today" : key === yesterday ? "Yesterday" : key,
      sessions: list,
    }));
}
