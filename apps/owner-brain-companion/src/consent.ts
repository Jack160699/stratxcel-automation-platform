import type { CompanionConfig } from "./config.ts";

export interface RawWindowInfo {
  appName: string;
  windowTitle: string;
}

export interface ConsentedSignal {
  appName: string;
  windowTitle: string | null;
}

/**
 * The one function every collected signal passes through before it's
 * even buffered locally, let alone sent — "capture only owner-approved
 * signals." No covert collection: if collectActiveApp is off, this
 * returns null and nothing is recorded for that tick at all, not even
 * locally.
 */
export function applyConsent(raw: RawWindowInfo, consent: CompanionConfig["consent"]): ConsentedSignal | null {
  if (!consent.collectActiveApp) return null;
  return {
    appName: raw.appName,
    windowTitle: consent.collectWindowTitle ? raw.windowTitle : null,
  };
}
