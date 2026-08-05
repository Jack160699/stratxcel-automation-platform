import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

export interface ApprovalSummaryItem {
  id: string;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  created_at: string;
}

const APPROVAL_STATUS_CHIP: Record<string, { label: string; state: ChipState }> = {
  PENDING: { label: "Pending", state: "warning" },
  APPROVED: { label: "Approved", state: "success" },
  REJECTED: { label: "Rejected", state: "danger" },
  EXPIRED: { label: "Expired", state: "neutral" },
};

/** Compact read-only approval row — for module pages that surface "pending approvals relevant to this area" without duplicating the full Approvals page's decide flow. Deciding always happens on /app/approvals. */
export function ApprovalSummary({ approval }: { approval: ApprovalSummaryItem }) {
  const chip = APPROVAL_STATUS_CHIP[approval.status] ?? { label: approval.status, state: "neutral" as ChipState };
  return (
    <Card variant="nested" className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-sx-text">{approval.kind}</p>
        <p className="mt-0.5 truncate text-xs text-sx-text-subtle">{JSON.stringify(approval.subject)}</p>
      </div>
      <StatusChip state={chip.state}>{chip.label}</StatusChip>
    </Card>
  );
}
