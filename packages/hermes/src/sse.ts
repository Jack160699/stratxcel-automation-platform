/**
 * Minimal server-side SSE (`text/event-stream`) parser over a fetch
 * `ReadableStream<Uint8Array>` body. Node's `fetch` has no native
 * `EventSource` for consuming a stream server-side, so this is a small,
 * deliberately narrow parser matching exactly what Hermes' Runs API emits:
 * `data: <json>\n\n` lines and `: <comment>\n\n` keepalive/sentinel lines
 * (e.g. `: keepalive`, `: stream closed` — see
 * gateway/platforms/api_server.py's `_handle_run_events`). No `id:`/`event:`
 * field support is needed because Hermes' stream never sends them (verified
 * live — see docs/hermes/RECONCILIATION.md).
 */

export interface ParsedSseEvent {
  /** Raw JSON string from a `data: ` line, undefined for a comment-only block. */
  data?: string;
  /** True when the block was a `:`-prefixed comment (e.g. `: stream closed`). */
  isComment: boolean;
  raw: string;
}

/**
 * Async-generator SSE line parser. Splits the byte stream on blank lines
 * (the SSE event boundary), decodes UTF-8, and yields one ParsedSseEvent per
 * block. Tolerates a block containing multiple `data:` lines by joining them
 * with `\n`, per the SSE spec, even though Hermes only ever sends one.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (let boundary = buffer.indexOf("\n\n"); boundary !== -1; boundary = buffer.indexOf("\n\n")) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
      }
    }
    if (buffer.trim()) {
      const parsed = parseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  if (lines.every((l) => l.startsWith(":"))) {
    return { isComment: true, raw: block };
  }

  const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  return { data: dataLines.join("\n"), isComment: false, raw: block };
}
