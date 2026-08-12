import { PlatformIcon, platformLabel, type Platform } from "./PlatformIcon";
import { StatusBadge } from "./StatusBadge";

export interface PlatformAccountRowData {
  platform: Platform;
  handle: string | null;
  status: "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED" | "NOT_CONNECTED";
  tokenHealth?: "HEALTHY" | "DEGRADED" | "INVALID" | null;
  lastSyncAt: string | null;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const STATUS_LABEL: Record<PlatformAccountRowData["status"], string> = {
  CONNECTED: "CONNECTED",
  REAUTH_REQUIRED: "ACTION REQUIRED",
  DISCONNECTED: "DISCONNECTED",
  NOT_CONNECTED: "NOT CONFIGURED",
};

/** Structured, scannable row for one platform's connection state — used in place of prose. */
export function PlatformAccountRow({ data }: { data: PlatformAccountRowData }) {
  const synced = relativeTime(data.lastSyncAt);
  return (
    <div className="saut-platform-row">
      <PlatformIcon platform={data.platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--saut-text)" }}>
            {platformLabel(data.platform)}
          </span>
          {data.handle && (
            <span className="truncate text-xs" style={{ color: "var(--saut-text-subtle)" }}>
              {data.handle}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge label={STATUS_LABEL[data.status]} />
        {data.status === "CONNECTED" && data.tokenHealth && (
          <StatusBadge
            label={data.tokenHealth === "HEALTHY" ? "HEALTHY" : "DEGRADED"}
            tone={data.tokenHealth === "HEALTHY" ? "green" : "amber"}
          />
        )}
        {synced && (
          <span className="saut-mono hidden text-[10.5px] sm:inline" style={{ color: "var(--saut-text-subtle)" }}>
            {synced}
          </span>
        )}
      </div>
    </div>
  );
}
