/**
 * Shared types for the Owner Operating Brain. Single-owner data (gated by
 * requireOwnerContext(), same as Social Autopilot) — not tenant-scoped.
 */

export type MemoryType =
  | "FACT"
  | "EXPLICIT_PREFERENCE"
  | "SELF_REPORTED_STATE"
  | "INFERRED_WORK_PATTERN"
  | "TEMPORARY_CONTEXT"
  | "DECISION"
  | "LESSON"
  | "OPEN_LOOP";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "FACT",
  "EXPLICIT_PREFERENCE",
  "SELF_REPORTED_STATE",
  "INFERRED_WORK_PATTERN",
  "TEMPORARY_CONTEXT",
  "DECISION",
  "LESSON",
  "OPEN_LOOP",
];

/**
 * Which memory types may only ever be created UNCONFIRMED and require an
 * explicit accept before they influence planning — an inference (or a
 * self-reported state that should decay) must never silently become a
 * durable fact. See lib/owner-brain/memory/lifecycle.ts.
 */
export const REQUIRES_CONFIRMATION: readonly MemoryType[] = ["INFERRED_WORK_PATTERN"];
export const AUTO_EXPIRES: readonly MemoryType[] = ["TEMPORARY_CONTEXT"];

export type ConfirmationState = "UNCONFIRMED" | "CONFIRMED" | "REJECTED";
export type MemoryFeedbackAction = "ACCEPT" | "CORRECT" | "FORGET" | "MARK_TEMPORARY" | "MARK_WRONG";

export type SourceKey =
  | "gmail"
  | "google_calendar"
  | "google_drive"
  | "notion"
  | "github"
  | "stratxcel_internal"
  | "stratxcel_admin_ui"
  | "voice_notes"
  | "desktop_companion"
  | "chat_platforms";

export type SourceStatus = "CONNECTED" | "AUTH_REQUIRED" | "PERMISSION_REQUIRED" | "UNAVAILABLE" | "ERROR" | "PAUSED";

export type SyncRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";

export type OwnerEventType =
  | "email_sent"
  | "calendar_event"
  | "calendar_change"
  | "notion_edit"
  | "github_commit"
  | "github_pull_request"
  | "github_issue"
  | "drive_doc_edit"
  | "admin_action"
  | "voice_note"
  | "desktop_app_session"
  | "chat_message";

export interface OwnerContextLike {
  ownerId: string;
}
