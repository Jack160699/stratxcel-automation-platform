import { ingestEvent } from "../repositories/events";
import { getFreshGoogleAccessToken } from "./token-access";
import type { SyncFn } from "./types";

interface GCalEvent {
  id: string;
  status: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string }>;
  updated: string;
  created: string;
}

/** Only ever stores a redacted projection (title length bucket, attendee count, duration, reschedule/cancel flag) — never the raw summary/description, which can contain sensitive third-party detail. */
export const syncGoogleCalendar: SyncFn = async ({ ownerId, sourceId, connectionId, cursor }) => {
  const accessToken = await getFreshGoogleAccessToken(connectionId!);
  const updatedMin = typeof cursor.updatedMin === "string" ? cursor.updatedMin : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    updatedMin,
    singleEvents: "true",
    orderBy: "updated",
    maxResults: "100",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar list failed: HTTP ${res.status}`);
  const body = (await res.json()) as { items?: GCalEvent[] };

  let ingested = 0;
  let latestUpdated = updatedMin;

  for (const event of body.items ?? []) {
    const start = event.start?.dateTime ?? event.start?.date;
    const end = event.end?.dateTime ?? event.end?.date;
    if (!start) continue;
    const durationMinutes = end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : null;
    const wasReschedule = event.created !== event.updated;

    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: event.id,
      eventType: event.status === "cancelled" ? "calendar_change" : wasReschedule ? "calendar_change" : "calendar_event",
      occurredAt: start,
      payload: {
        titleLength: event.summary?.length ?? 0,
        attendeeCount: event.attendees?.length ?? 0,
        durationMinutes,
        status: event.status,
        hour: new Date(start).getHours(),
      },
    });
    if (inserted) ingested += 1;
    if (event.updated > latestUpdated) latestUpdated = event.updated;
  }

  return { eventsIngested: ingested, nextCursor: { updatedMin: latestUpdated } };
};
