import { ingestEvent } from "../repositories/events";
import { admitMemoryCandidate } from "../memory/lifecycle";
import { getFreshGoogleAccessToken } from "./token-access";
import { extractDomain } from "./pure";
import type { SyncFn } from "./types";

export { extractDomain };

interface GmailMessageMeta {
  id: string;
  internalDate: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
}

/**
 * Deliberately fetches metadata-only (format=metadata, no body) — this
 * connector only ever sees subject lines, recipients and timestamps, never
 * email content. "Sent mail" only (q=in:sent) — the owner's own authored
 * replies, matching the brief's scope (never other people's incoming mail
 * content).
 */
export const syncGmail: SyncFn = async ({ ownerId, sourceId, connectionId, cursor }) => {
  const accessToken = await getFreshGoogleAccessToken(connectionId!);
  const afterEpochSeconds = typeof cursor.afterEpochSeconds === "number" ? cursor.afterEpochSeconds : 0;
  const query = afterEpochSeconds ? `in:sent after:${afterEpochSeconds}` : "in:sent";

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: HTTP ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };

  let ingested = 0;
  let latestEpoch = afterEpochSeconds;

  for (const ref of list.messages ?? []) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as GmailMessageMeta;
    const headers = msg.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const to = headers.find((h) => h.name === "To")?.value ?? "";
    const sentAtMs = Number(msg.internalDate);
    const sentAtIso = new Date(sentAtMs).toISOString();

    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: msg.id,
      eventType: "email_sent",
      occurredAt: sentAtIso,
      payload: { subjectLength: subject.length, recipientDomain: extractDomain(to), hour: new Date(sentAtMs).getHours() },
    });
    if (inserted) ingested += 1;
    latestEpoch = Math.max(latestEpoch, Math.floor(sentAtMs / 1000));
  }

  if (ingested >= 15) {
    await admitMemoryCandidate(ownerId, {
      category: "communication",
      statement: `Sends a high volume of email (${ingested}+ sent messages) in short windows — possible batching pattern.`,
      memoryType: "INFERRED_WORK_PATTERN",
      confidence: 0.4,
      provenance: { sourceId, note: "gmail sync volume heuristic" },
    });
  }

  return { eventsIngested: ingested, nextCursor: { afterEpochSeconds: latestEpoch } };
};
