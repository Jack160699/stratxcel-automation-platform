import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

export type IntegrationConnectionState = "connected" | "disconnected" | "connecting" | "revoked" | "error" | "not_supported";

const INTEGRATION_CHIP: Record<IntegrationConnectionState, { label: string; state: ChipState }> = {
  connected: { label: "Connected", state: "success" },
  connecting: { label: "Connecting", state: "warning" },
  disconnected: { label: "Not connected", state: "dashed" },
  revoked: { label: "Access revoked", state: "danger" },
  error: { label: "Error", state: "danger" },
  not_supported: { label: "Not available here", state: "neutral" },
};

/** One row describing a connected-service state (Drive, domain, ad account, ...) — reused by Files, Website, Ads, Integrations. */
export function IntegrationStatus({ name, state, detail }: { name: string; state: IntegrationConnectionState; detail?: string }) {
  const chip = INTEGRATION_CHIP[state];
  return (
    <div className="flex items-center justify-between gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-sx-text">{name}</p>
        {detail && <p className="mt-0.5 truncate text-xs text-sx-text-subtle">{detail}</p>}
      </div>
      <StatusChip state={chip.state}>{chip.label}</StatusChip>
    </div>
  );
}
