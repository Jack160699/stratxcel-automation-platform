import type { AgentTurnMessage } from "../provider.ts";
import type { AgentMessageRow } from "../sessions/repository.ts";

export const HISTORY_MAX_MESSAGES = 20;
export const HISTORY_MAX_CHARS = 12_000;

/** Deterministic newest-first budget, returned oldest-first for the model. */
export function boundConversationHistory(rows: readonly AgentMessageRow[]): AgentTurnMessage[] {
  const selected: AgentMessageRow[] = [];
  let chars = 0;
  for (let i = rows.length - 1; i >= 0 && selected.length < HISTORY_MAX_MESSAGES; i -= 1) {
    const row = rows[i];
    if (chars + row.content.length > HISTORY_MAX_CHARS && selected.length) break;
    selected.push({ ...row, content: row.content.slice(-HISTORY_MAX_CHARS) });
    chars += Math.min(row.content.length, HISTORY_MAX_CHARS);
  }
  return selected.reverse().map((row) => ({ role: row.role, content: row.content, toolName: row.tool_name ?? undefined }));
}
