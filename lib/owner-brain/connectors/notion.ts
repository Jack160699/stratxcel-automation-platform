import { ingestEvent } from "../repositories/events";
import { getStoredSecret } from "./token-access";
import type { SyncFn } from "./types";

interface NotionSearchResult {
  id: string;
  object: "page" | "database";
  last_edited_time: string;
  url: string;
  properties?: Record<string, { title?: Array<{ plain_text: string }> }>;
}

function extractTitle(result: NotionSearchResult): string {
  for (const prop of Object.values(result.properties ?? {})) {
    if (prop.title?.length) return prop.title.map((t) => t.plain_text).join("");
  }
  return "(untitled)";
}

/**
 * Uses the owner's Notion internal-integration secret (entered once via
 * the admin UI's secure field, never chat — see
 * app/api/admin/operating-brain/connectors/notion/connect/route.ts).
 * Ingests only page metadata (title, last-edited time, URL) — full page
 * content is deliberately not pulled here; that's a follow-up job once
 * the memory-extraction pipeline needs it, kept out of scope for this
 * pass to avoid storing large arbitrary owner text in owner_events.
 */
export const syncNotion: SyncFn = async ({ ownerId, sourceId, connectionId, cursor }) => {
  const token = await getStoredSecret(connectionId!);
  const sinceIso = typeof cursor.sinceIso === "string" ? cursor.sinceIso : new Date(0).toISOString();

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 50,
    }),
  });
  if (!res.ok) throw new Error(`Notion search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { results: NotionSearchResult[] };

  let ingested = 0;
  let latest = sinceIso;
  for (const page of body.results) {
    if (page.last_edited_time <= sinceIso) continue;
    const title = extractTitle(page);
    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: page.id,
      eventType: "notion_edit",
      occurredAt: page.last_edited_time,
      payload: { title, titleLength: title.length, url: page.url },
    });
    if (inserted) ingested += 1;
    if (page.last_edited_time > latest) latest = page.last_edited_time;
  }

  return { eventsIngested: ingested, nextCursor: { sinceIso: latest } };
};

/** Used by the connect route to verify the token actually works before marking the connection CONNECTED. */
export async function verifyNotionToken(token: string): Promise<boolean> {
  const res = await fetch("https://api.notion.com/v1/users/me", {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
  });
  return res.ok;
}
