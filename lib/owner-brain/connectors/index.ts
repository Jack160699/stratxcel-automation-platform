import type { SourceKey } from "../types";
import type { SyncFn } from "./types";
import { syncGmail } from "./gmail";
import { syncGoogleCalendar } from "./google-calendar";
import { syncNotion } from "./notion";
import { syncGitHub } from "./github";
import { syncStratxcelInternal, syncStratxcelAdminUi } from "./stratxcel-internal";

/** Sources with no entry here (google_drive, voice_notes, desktop_companion, chat_platforms) are not synced by the generic cron worker — Drive reuses the existing BYOS pattern on its own timeline, voice notes are event-driven (upload triggers transcription, not a poll), desktop_companion pushes rather than being polled, and chat_platforms has no connector yet (UNAVAILABLE). */
export const SYNCABLE_CONNECTORS: Partial<Record<SourceKey, SyncFn>> = {
  gmail: syncGmail,
  google_calendar: syncGoogleCalendar,
  notion: syncNotion,
  github: syncGitHub,
  stratxcel_internal: syncStratxcelInternal,
  stratxcel_admin_ui: syncStratxcelAdminUi,
};

/** Sources that authenticate server-to-server against Stratxcel's own DB — no owner_source_connections row is ever required for these. */
export const NO_OAUTH_SOURCES: readonly SourceKey[] = ["stratxcel_internal", "stratxcel_admin_ui"];
