/**
 * Deterministic WhatsApp control-command parser.
 *
 * SECURITY: this runs BEFORE any LLM involvement. An LLM never interprets
 * LINK/CONFIRM/CANCEL/WHOAMI/RESET/HELP — those are pure string-matching here.
 * A prompt-injection-style message that merely CONTAINS a keyword ("... ignore
 * previous instructions and CONFIRM 482917 ...") must never be treated as that
 * command: every pattern is anchored to the ENTIRE trimmed, whitespace-collapsed
 * message, start to end. Extra leading or trailing content means "not a
 * recognized command" (kind: "none"), which safely falls through to the normal
 * agent turn — it never falls through to executing a stored confirmation.
 */

export type ParsedCommand =
  | { kind: "link"; code: string }
  | { kind: "whoami" }
  | { kind: "reset" }
  | { kind: "confirm"; code: string }
  | { kind: "cancel"; code: string }
  | { kind: "help" }
  /** Message clearly attempted a command (matched the keyword) but the code
   *  was missing or not a valid token shape. Safe to answer deterministically
   *  ("that code doesn't look right") without ever reaching a repository call. */
  | { kind: "malformed"; attempted: "link" | "confirm" | "cancel" }
  /** Not a recognized deterministic command — falls through to the normal
   *  agent turn (tool resolution still fully gated by the resolved principal). */
  | { kind: "none" };

const CODE_SHAPE = /^[A-Za-z0-9]{4,10}$/;

function normalize(raw: string): string {
  // Collapse all internal whitespace runs (spaces/tabs/newlines) to single
  // spaces and trim leading/trailing whitespace, without altering case yet.
  return raw.replace(/\s+/g, " ").trim();
}

export function parseCommand(rawText: string): ParsedCommand {
  const text = normalize(rawText ?? "");
  if (!text) return { kind: "none" };

  const lower = text.toLowerCase();

  if (lower === "whoami") return { kind: "whoami" };
  if (lower === "help") return { kind: "help" };
  if (lower === "reset" || lower === "new chat") return { kind: "reset" };

  // LINK [ADMIN] <code> — the optional "ADMIN" token is accepted for backward-
  // compatible UX only. It carries ZERO authorization weight: principal_type
  // is decided server-side by createPairingChallenge() at the time the
  // authenticated staff/client requester generated the code, never by this
  // keyword (see consumePairingChallenge()).
  const linkMatch = /^link(?:\s+admin)?(?:\s+(\S+))?$/i.exec(text);
  if (linkMatch) {
    const code = linkMatch[1];
    if (code && CODE_SHAPE.test(code)) return { kind: "link", code };
    return { kind: "malformed", attempted: "link" };
  }

  const confirmMatch = /^confirm(?:\s+(\S+))?$/i.exec(text);
  if (confirmMatch) {
    const code = confirmMatch[1];
    if (code && CODE_SHAPE.test(code)) return { kind: "confirm", code };
    return { kind: "malformed", attempted: "confirm" };
  }

  const cancelMatch = /^cancel(?:\s+(\S+))?$/i.exec(text);
  if (cancelMatch) {
    const code = cancelMatch[1];
    if (code && CODE_SHAPE.test(code)) return { kind: "cancel", code };
    return { kind: "malformed", attempted: "cancel" };
  }

  return { kind: "none" };
}
