/**
 * WhatsApp response formatter (PHASE 24). Every reply that goes out over
 * WhatsApp — deterministic command replies, tool-result summaries, and final
 * assistant text — passes through here so output stays mobile-readable,
 * bounded, and never dumps raw JSON or a Markdown table on the user.
 */
import type { AgentPrincipal, AgentPrincipalResolution } from "./principal.ts";
import type { CapabilityGroup } from "./brain/capabilities.ts";

const MAX_REPLY_CHARS = 1400;
const MAX_LIST_ITEMS = 5;
const INTERNAL_ID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\d -]{8,}\d)\b/g;
const LINK_CODE_PATTERN = /\bLINK(?:\s+ADMIN)?\s+[a-z0-9]{4,12}\b/gi;
const ISO_DATE_HOUR_PATTERN = /^\d{4}-\d{2}-\d{2}(?:\s+\d{2})?$/;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Keep internal record identifiers and phone-like values out of normal
 * user-facing chat while retaining raw tool payloads in model context and
 * server-side audit telemetry. */
export function sanitizeAgentReplyText(text: string): string {
  return text
    .replace(INTERNAL_ID_PATTERN, "[internal reference]")
    .replace(LINK_CODE_PATTERN, "LINK [redacted]")
    .replace(PHONE_PATTERN, (value) => {
      const digits = value.replace(/\D/g, "");
      const normalized = value.trim();
      if (ISO_DATE_HOUR_PATTERN.test(normalized)) return value;
      return digits.length >= 10 && digits.length <= 15 ? `••••••••${digits.slice(-2)}` : value;
    });
}

/** Summarizes an arbitrary tool result object into a short bullet list.
 *  Arrays are shown as "top N items + total count", never dumped whole. */
export function summarizeToolResult(toolName: string, result: unknown): string {
  const toolLabel = humanizeLabel(toolName);
  if (result === null || result === undefined) return `${toolLabel}: no result.`;

  if (Array.isArray(result)) {
    return summarizeArray(toolLabel, result);
  }

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    // Common shape from our read tools: a single named array field, e.g. {leads:[...]}.
    const arrayEntry = Object.entries(obj).find(([, v]) => Array.isArray(v));
    if (arrayEntry) {
      const [key, arr] = arrayEntry as [string, unknown[]];
      return summarizeArray(humanizeLabel(key), arr);
    }
    const lines = Object.entries(obj)
      .filter(([key]) => !isPrivateToolField(key))
      .slice(0, 8)
      .map(([k, v]) => `- ${humanizeLabel(k)}: ${summarizeScalar(v)}`);
    return lines.length ? lines.join("\n") : `${toolLabel}: done.`;
  }

  return `${toolLabel}: ${summarizeScalar(result)}`;
}

function humanizeLabel(value: string): string {
  const withoutVerb = value.replace(/^(?:list|get|find|show|fetch)_/, "");
  return withoutVerb.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const TOOL_ACTION_LABELS: Record<string, string> = {
  update_lead_status: "update the lead status",
  assign_lead: "assign the lead",
  set_conversation_automation_mode: "change the conversation automation mode",
  create_follow_up: "schedule the follow-up",
  schedule_appointment: "schedule the appointment",
  create_mission: "create the mission",
  create_handoff: "create the human handoff",
  request_handoff: "request a human handoff",
  remember_fact: "save this memory",
  forget_fact: "forget this memory",
};

export function describeToolAction(toolName: string): string {
  return TOOL_ACTION_LABELS[toolName] ?? toolName.replaceAll("_", " ");
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
  const preferredKeys = ["name", "contact_name", "title", "status"];
  const parts = preferredKeys
    .filter((k) => k in obj && obj[k] !== null && obj[k] !== undefined)
    .slice(0, 3)
    .map((k) => `${k}: ${summarizeScalar(obj[k])}`);
  return parts.length ? parts.join(", ") : "item available";
}

function isPrivateToolField(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "id" || normalized.endsWith("_id") || normalized.includes("phone") || normalized.includes("token") || normalized.includes("secret") || normalized.includes("password") || normalized.includes("authorization");
}

function summarizeScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return truncate(value, 80);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  return "available";
}

export interface FormatAgentReplyInput {
  text?: string;
  toolSummaries?: string[];
  confirmationPrompt?: string;
  /** Deterministic, non-LLM-authored facts about a mutating tool's real
   *  outcome (see tools/contract.ts's interpretOutcome / orchestrator.ts's
   *  verificationNotes) -- appended UNCONDITIONALLY, never gated behind
   *  whether `text` is present. This is what guarantees a real failed/
   *  pending/partial mutation reaches the user even when the model's own
   *  `text` claims success -- the exact live-observed defect this exists to
   *  close. Never omit a real note to keep a reply shorter. */
  verificationNotes?: string[];
}

/** Composes the final outbound WhatsApp message. Bullets, no tables, bounded
 *  length, at most ONE message produced (no multi-message spam). */
export function formatAgentReply(input: FormatAgentReplyInput): string {
  const sections: string[] = [];
  if (input.text) sections.push(input.text.trim());
  if (input.toolSummaries?.length) sections.push(input.toolSummaries.join("\n\n"));
  if (input.verificationNotes?.length) sections.push(input.verificationNotes.join("\n"));
  if (input.confirmationPrompt) sections.push(input.confirmationPrompt.trim());
  const composed = sections.filter(Boolean).join("\n\n") || "Done.";
  return truncate(sanitizeAgentReplyText(composed), MAX_REPLY_CHARS);
}

export function formatConfirmationPrompt(input: { humanSummary: string; code: string; ttlMinutes: number }): string {
  return `${input.humanSummary}\nReply CONFIRM ${input.code} within ${input.ttlMinutes} minutes, or CANCEL ${input.code} to discard.`;
}

const PERMISSION_LABELS: Record<string, string> = {
  clients: "clients and agency overview", leads: "leads", conversations: "conversations",
  missions: "missions", approvals: "approvals", handoffs: "human handoffs",
  operations: "operations", health: "platform health", integrations: "integrations",
  audit: "audit information", finance: "finance information", social: "social accounts and publishing information",
  workspace: "workspace", artifacts: "artifacts", reports: "reports", brand: "brand information",
};

function titleCase(value: string): string {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function capabilitySummary(permissions: readonly string[]): { read: string[]; confirm: string[]; dashboardOnly: string[] } {
  const read = new Set<string>();
  const confirm = new Set<string>();
  for (const permission of permissions) {
    const parts = permission.split(":");
    const label = PERMISSION_LABELS[parts[2]] ?? parts[2]?.replaceAll("_", " ");
    if (!label) continue;
    (parts[1] === "read" ? read : confirm).add(label);
  }
  return { read: [...read], confirm: [...confirm], dashboardOnly: ["security and access changes", "payments and destructive actions"] };
}

export function formatWhoAmI(resolution: AgentPrincipalResolution | "staff" | "client_linked" | "unlinked", capabilities: CapabilityGroup[] = []): string {
  if (typeof resolution === "string") return formatLegacyWhoAmI(resolution);
  if (resolution.status !== "resolved") return "WhatsApp is not linked to a Stratxcel account.";
  const principal = resolution.principal;
  const lines = ["✅ WhatsApp Agent linked", `Account: ${principal.kind === "staff" ? "Stratxcel staff" : "Client workspace"}`, `Role: ${titleCase(principal.role)}`];
  if (principal.kind === "staff" && principal.department) lines.push(`Department: ${titleCase(principal.department)}`);
  if (principal.kind === "staff") lines.push(`Access: ${titleCase(principal.accessProfile ?? "role_default")}`);
  if (capabilities.length) lines.push(`Capabilities: ${capabilities.slice(0, 7).map((item) => item.name).join(", ")}`);
  return lines.join("\n");
}

export function formatLegacyWhoAmI(resolution: "staff" | "client_linked" | "unlinked", workspaceName?: string): string {
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

export function formatPermissionAwareHelp(principal: AgentPrincipal, capabilities: CapabilityGroup[]): string {
  const examples = capabilities.slice(0, 3).map((area) => `• Show me ${area.name.toLowerCase()}`).join("\n");
  const readable = capabilities.filter((item) => item.risk === "read");
  const confirmable = capabilities.filter((item) => item.risk === "low_mutation");
  return formatAgentReply({ text: [
    `Stratxcel Agent — ${principal.kind === "staff" ? titleCase(principal.role) : titleCase(principal.role)}`,
    readable.length ? `You can ask about:\n• ${readable.map((item) => item.name).join("\n• ")}` : "No read categories are currently assigned.",
    confirmable.length ? `Eligible changes require confirmation:\n• ${confirmable.map((item) => item.name).join("\n• ")}` : "Your Agent access is read-only.",
    examples ? `Try:\n${examples}` : "",
    "Safety: security, payment, destructive and other high-risk actions stay dashboard-only.",
    "Commands: WHOAMI · RESET / NEW CHAT · CONFIRM <code> · CANCEL <code> · HELP",
  ].filter(Boolean).join("\n\n") });
}
