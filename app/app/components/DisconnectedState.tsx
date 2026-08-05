import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/**
 * Generic "this needs a connection/integration/approval that doesn't exist
 * yet" notice — the non-Social-specific sibling of
 * app/app/content/StaffScopedNotice.tsx. Used across Website, Ads, Files
 * and anywhere else a module has a real UI but no real backend connection.
 */
export function DisconnectedState({ title, reason, cta }: { title: string; reason?: string; cta?: ReactNode }) {
  return (
    <Card variant="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-sx-text">{title}</p>
        <p className="mt-1 text-xs text-sx-text-muted">{reason ?? "Execution service is not connected in this environment."}</p>
      </div>
      {cta && <div className="shrink-0">{cta}</div>}
    </Card>
  );
}

/** Inline note next to a disabled button/action explaining why it's disabled — never leave a disabled control unexplained. */
export function ActionUnavailableNotice({ reason }: { reason: string }) {
  return (
    <p className="text-xs text-sx-text-subtle" role="note">
      {reason}
    </p>
  );
}
