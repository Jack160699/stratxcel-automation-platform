/**
 * WhatsApp response formatter (PHASE 24). Every reply that goes out over
 * WhatsApp — deterministic command replies, tool-result summaries, and final
 * assistant text — passes through here so output stays mobile-readable,
 * bounded, and never dumps raw JSON or a Markdown table on the user.
 */

const MAX_REPLY_CHARS = 1400;
const MAX_LIST_ITEMS = 5;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Summarizes an arbitrary tool result object into a short bullet list.
 *  Arrays are shown as "top N items + total count", never dumped whole. */
export function summarizeToolResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) return `${toolName}: no result.`;

  if (Array.isArray(result)) {
    return summarizeArray(toolName, result);
  }

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    // Common shape from our read tools: a single named array field, e.g. {leads:[...]}.
    const arrayEntry = Object.entries(obj).find(([, v]) => Array.isArray(v));
    if (arrayEntry) {
      const [key, arr] = arrayEntry as [string, unknown[]];
      return summarizeArray(`${toolName} (${key})`, arr);
    }
    const lines = Object.entries(obj)
      .slice(0, 8)
      .map(([k, v]) => `- ${k}: ${summarizeScalar(v)}`);
    return lines.length ? lines.join("\n") : `${toolName}: done.`;
  }

  return `${toolName}: ${summarizeScalar(result)}`;
}

function summarizeArray(label: string, arr: unknown[]): string {
  if (arr.length === 0) return `${label}: none found.`;
  const shown = arr.slice(0, MAX_LIST_ITEMS).map((item, i) => `${i + 1}. ${summarizeListItem(item)}`);
  const remaining = arr.length - shown.length;
  const footer = remaining > 0 ? `\n…and ${remaining} more (${arr.length} total).` : "";
  return `${label} (${arr.length} total):\n${shown.join("\n")}${footer}`;
}

function summarizeListItem(item: unknown): string {
  if (item === null || item === undefined) return "—";
  if (typeof item !== "object") return summarizeScalar(item);
  const obj = item as Record<string, unknown>;
  // Prefer a small set of commonly-useful identifying fields if present.
  const preferredKeys = ["name", "contact_name", "title", "status", "id", "email", "contact_phone"];
  const parts = preferredKeys
    .filter((k) => k in obj && obj[k] !== null && obj[k] !== undefined)
    .slice(0, 3)
    .map((k) => `${k}: ${summarizeScalar(obj[k])}`);
  return parts.length ? parts.join(", ") : summarizeScalar(JSON.stringify(obj));
}

function summarizeScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return truncate(value, 80);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return truncate(JSON.stringify(value), 80);
}

export interface FormatAgentReplyInput {
  text?: string;
  toolSummaries?: string[];
  confirmationPrompt?: string;
}

/** Composes the final outbound WhatsApp message. Bullets, no tables, bounded
 *  length, at most ONE message produced (no multi-message spam). */
export function formatAgentReply(input: FormatAgentReplyInput): string {
  const sections: string[] = [];
  if (input.text) sections.push(input.text.trim());
  if (input.toolSummaries?.length) sections.push(input.toolSummaries.join("\n\n"));
  if (input.confirmationPrompt) sections.push(input.confirmationPrompt.trim());
  const composed = sections.filter(Boolean).join("\n\n") || "Done.";
  return truncate(composed, MAX_REPLY_CHARS);
}

export function formatConfirmationPrompt(input: { humanSummary: string; code: string; ttlMinutes: number }): string {
  return `${input.humanSummary}\nReply CONFIRM ${input.code} within ${input.ttlMinutes} minutes, or CANCEL ${input.code} to discard.`;
}

export function formatWhoAmI(
  resolution: "staff" | "client_linked" | "unlinked",
  workspaceName?: string
): string {
  if (resolution === "staff") return "Linked as Stratxcel staff.";
  if (resolution === "client_linked") return `Linked to ${workspaceName ?? "your workspace"}.`;
  return "WhatsApp is not linked to a Stratxcel account.";
}

export const HELP_TEXT = [
  "Stratxcel Agent — WhatsApp commands:",
  "- LINK <code> — link this number using a pairing code from the dashboard",
  "- WHOAMI — show what this number is linked to",
  "- RESET / NEW CHAT — start a fresh conversation (keeps your link)",
  "- CONFIRM <code> — confirm a pending action",
  "- CANCEL <code> — cancel a pending action",
  "- HELP — show this message",
].join("\n");
