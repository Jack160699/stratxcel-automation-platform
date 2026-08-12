export type StatusTone = "green" | "blue" | "amber" | "red" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  green: "saut-chip-success",
  blue: "saut-chip-info",
  amber: "saut-chip-warning",
  red: "saut-chip-danger",
  neutral: "saut-chip-neutral",
};

/** Maps a known status word to its semantic tone. Falls back to neutral for anything unrecognized. */
const LABEL_TONE: Record<string, StatusTone> = {
  CONNECTED: "green",
  HEALTHY: "green",
  READY: "green",
  "IN PROGRESS": "blue",
  SCHEDULED: "blue",
  INFO: "blue",
  "ACTION REQUIRED": "amber",
  PARTIAL: "amber",
  "NOT CONFIGURED": "amber",
  DEGRADED: "amber",
  FAILED: "red",
  DISCONNECTED: "red",
  ERROR: "red",
  PAUSED: "neutral",
  UNKNOWN: "neutral",
};

export function toneForLabel(label: string): StatusTone {
  return LABEL_TONE[label.toUpperCase()] ?? "neutral";
}

/**
 * The one reusable status/state indicator for the Command Center — wraps the
 * existing .saut-chip system so every badge in the page (accounts, missions,
 * jobs, attention items) reads with the same visual language.
 */
export function StatusBadge({
  label,
  tone,
  pulse = false,
}: {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
}) {
  const resolvedTone = tone ?? toneForLabel(label);
  return (
    <span className={`saut-chip ${TONE_CLASS[resolvedTone]}`}>
      <span className={`saut-chip-dot${pulse ? " saut-pulse" : ""}`} />
      {label}
    </span>
  );
}
