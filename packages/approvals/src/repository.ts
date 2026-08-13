import { recordAuditEvent } from "@stratxcel/audit";
import {
  createPostgresEmailOutboxStore,
  enqueueApprovalRequiredEmailBestEffort,
  resolveTenantOwnerEmailForNotify,
} from "@stratxcel/email-runtime";
import type { ServiceClient } from "./db.ts";
import type { ApprovalKind, ApprovalRow, ApprovalStatus } from "./types.ts";

export class ApprovalAlreadyDecidedError extends Error {
  constructor(approvalId: string, status: ApprovalStatus) {
    super(`Approval ${approvalId} was already decided (${status})`);
    this.name = "ApprovalAlreadyDecidedError";
  }
}

export async function requestApproval(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    missionId?: string | null;
    kind: ApprovalKind;
    subject: Record<string, unknown>;
    requestedBy?: string | null;
  }
): Promise<ApprovalRow> {
  const { data, error } = await supabase
    .from("approvals")
    .insert({
      tenant_id: input.tenantId,
      mission_id: input.missionId ?? null,
      kind: input.kind,
      subject: input.subject,
      requested_by: input.requestedBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`requestApproval: ${error.message}`);
  const row = data as ApprovalRow;

  // Best-effort notification — never rolls back the inserted approval.
  try {
    const store = createPostgresEmailOutboxStore(supabase);
    const { email, ownerId } = await resolveTenantOwnerEmailForNotify(supabase, input.tenantId);
    if (email) {
      const subject = input.subject ?? {};
      const businessName = typeof subject.businessName === "string" ? subject.businessName : "Your business";
      const missionTitle =
        typeof subject.title === "string"
          ? subject.title
          : typeof subject.missionTitle === "string"
            ? subject.missionTitle
            : `${input.kind} approval`;
      const approvalSummary =
        typeof subject.summary === "string" ? subject.summary : "A Stratxcel action is waiting for your approval.";
      await enqueueApprovalRequiredEmailBestEffort(store, {
        approvalId: row.id,
        tenantId: input.tenantId,
        recipient: email,
        businessName,
        missionTitle,
        approvalSummary,
        ownerId,
      });
    }
  } catch (err) {
    console.error("[approvals] email notify failed", err instanceof Error ? err.message : err);
  }

  return row;
}

/**
 * Decides an approval exactly once — re-checks the current status inside
 * the same call rather than trusting the caller's view of it, so two
 * concurrent decisions (e.g. a double-click) can't both "succeed" against
 * a PENDING approval that was already resolved by the first one.
 */
export async function decideApproval(
  supabase: ServiceClient,
  input: { approvalId: string; decision: "APPROVED" | "REJECTED"; decidedBy: string }
): Promise<ApprovalRow> {
  const { data: current, error: fetchError } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", input.approvalId)
    .single();
  if (fetchError) throw new Error(`decideApproval: ${fetchError.message}`);
  if (current.status !== "PENDING") {
    throw new ApprovalAlreadyDecidedError(input.approvalId, current.status as ApprovalStatus);
  }

  const { data, error } = await supabase
    .from("approvals")
    .update({ status: input.decision, decided_by: input.decidedBy, decided_at: new Date().toISOString() })
    .eq("id", input.approvalId)
    .eq("status", "PENDING")
    .select("*")
    .single();
  if (error) throw new Error(`decideApproval: ${error.message}`);

  await recordAuditEvent(supabase, {
    tenantId: current.tenant_id,
    actorUserId: input.decidedBy,
    actorKind: "user",
    action: `approval.${input.decision.toLowerCase()}`,
    targetType: "approval",
    targetId: input.approvalId,
    metadata: { kind: current.kind },
  });

  return data as ApprovalRow;
}

export async function listPendingApprovals(supabase: ServiceClient, tenantId: string): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPendingApprovals: ${error.message}`);
  return (data ?? []) as ApprovalRow[];
}
