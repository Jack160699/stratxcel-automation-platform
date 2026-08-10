import type { SourceKey } from "../types";

export interface SourceDefinition {
  sourceKey: SourceKey;
  displayName: string;
  category: "communication" | "calendar" | "docs" | "code" | "notes" | "internal" | "voice" | "desktop" | "chat";
  /** Least-privilege scopes this connector requests — never "everything". */
  scopes: string[];
  dataCategories: string[];
  /** Env vars that must be set before this connector can even attempt AUTH_REQUIRED -> CONNECTED. */
  requiredEnvVars: string[];
  /** True if the connector code path exists and is real (not just registry metadata). */
  implemented: boolean;
  defaultRetentionDays: number;
  connectHref?: string;
}

/**
 * The real, complete source registry — every row here has a concrete
 * connector behind it (see connectors/index.ts) or an honest "unavailable"
 * status. Nothing in this file claims a source is CONNECTED; that comes
 * only from a real owner_source_connections row after OAuth consent
 * actually completed.
 */
export const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    sourceKey: "gmail",
    displayName: "Gmail",
    category: "communication",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    dataCategories: ["sent message metadata", "recipient/timestamp", "response latency"],
    requiredEnvVars: ["GOOGLE_OWNER_BRAIN_CLIENT_ID", "GOOGLE_OWNER_BRAIN_CLIENT_SECRET"],
    implemented: true,
    defaultRetentionDays: 180,
    connectHref: "/api/admin/operating-brain/connectors/google/connect?source=gmail",
  },
  {
    sourceKey: "google_calendar",
    displayName: "Google Calendar",
    category: "calendar",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    dataCategories: ["events", "reschedules", "cancellations", "meeting load"],
    requiredEnvVars: ["GOOGLE_OWNER_BRAIN_CLIENT_ID", "GOOGLE_OWNER_BRAIN_CLIENT_SECRET"],
    implemented: true,
    defaultRetentionDays: 180,
    connectHref: "/api/admin/operating-brain/connectors/google/connect?source=google_calendar",
  },
  {
    sourceKey: "google_drive",
    displayName: "Google Drive",
    category: "docs",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    dataCategories: ["approved documents", "plans", "working drafts"],
    requiredEnvVars: ["GOOGLE_OWNER_BRAIN_CLIENT_ID", "GOOGLE_OWNER_BRAIN_CLIENT_SECRET"],
    implemented: true,
    defaultRetentionDays: 180,
    connectHref: "/api/admin/operating-brain/connectors/google/connect?source=google_drive",
  },
  {
    sourceKey: "notion",
    displayName: "Notion",
    category: "notes",
    scopes: ["read_content"],
    dataCategories: ["Daily Operating Review", "project/task decisions", "corrections"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 365,
    connectHref: "/admin/operating-brain?configure=notion",
  },
  {
    sourceKey: "github",
    displayName: "GitHub",
    category: "code",
    scopes: ["fine-grained PAT: Contents/Pull requests/Issues, read-only"],
    dataCategories: ["commits", "pull requests", "issues", "reviews"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 365,
    connectHref: "/admin/operating-brain?configure=github",
  },
  {
    sourceKey: "stratxcel_internal",
    displayName: "Stratxcel Internal (audit)",
    category: "internal",
    scopes: ["read-only, allowlisted tables"],
    dataCategories: ["missions", "approvals", "project status changes", "safe operational events"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 365,
  },
  {
    sourceKey: "stratxcel_admin_ui",
    displayName: "Stratxcel Admin UI activity",
    category: "internal",
    scopes: ["read-only, allowlisted actions"],
    dataCategories: ["approvals", "decisions", "workflow progress"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 365,
  },
  {
    sourceKey: "voice_notes",
    displayName: "Voice Notes",
    category: "voice",
    scopes: ["n/a — direct upload"],
    dataCategories: ["audio", "transcript", "structured extraction"],
    requiredEnvVars: ["GEMINI_API_KEY"],
    implemented: true,
    defaultRetentionDays: 365,
  },
  {
    sourceKey: "desktop_companion",
    displayName: "Desktop Companion (Windows)",
    category: "desktop",
    scopes: ["device-paired bearer token, owner-approved signals only"],
    dataCategories: ["active application", "approved window titles", "session duration", "voice notes"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 90,
  },
  {
    sourceKey: "chat_platforms",
    displayName: "Chat Platforms",
    category: "chat",
    scopes: ["provider-specific, least privilege"],
    dataCategories: ["normalized provider events", "owner-authorized imports"],
    requiredEnvVars: [],
    implemented: true,
    defaultRetentionDays: 180,
  },
];

export function getSourceDefinition(sourceKey: SourceKey): SourceDefinition {
  const def = SOURCE_REGISTRY.find((s) => s.sourceKey === sourceKey);
  if (!def) throw new Error(`Unknown source key: ${sourceKey}`);
  return def;
}

/** True only when every env var the connector needs to even start OAuth is present. */
export function connectorEnvReady(sourceKey: SourceKey): boolean {
  const def = getSourceDefinition(sourceKey);
  if (!def.implemented) return false;
  return def.requiredEnvVars.every((name) => Boolean(process.env[name]));
}
