import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { deriveAuditCustomerState, isAuditIntakeComplete, type AuditOrderStatus } from "@/lib/audit/customer-state";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { Card } from "@/components/ui/Card";
import { AuditDeliveryForm } from "./AuditDeliveryForm";
import { AuditRecoveryActions } from "./AuditRecoveryActions";
import { AuditResetActions } from "./AuditResetActions";

export const metadata: Metadata = {
  title: "Audit Delivery — Stratxcel Admin",
  robots: { index: false, follow: false },
};

interface AuditOrderItem {
  id: string;
  tenant_id: string;
  user_id: string | null;
  guest_email: string | null;
  business_name: string;
  industry: string | null;
  website_url: string | null;
  status: AuditOrderStatus;
  audit_fee_cents: number;
  deep_dive_answers: Record<string, unknown> | null;
  goals_answers: Record<string, unknown> | null;
  report_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface AuditGenerationItem {
  id: string;
  audit_order_id: string;
  status: "QUEUED" | "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "STOPPED" | "FAILED";
  stage: string;
  brand_brain_version: number;
  attempt_count: number;
  recovery_count: number;
  quality_outcome: string | null;
  quality_score: number | null;
  failure_code: string | null;
  failure_message_safe: string | null;
  research_data: unknown;
  evidence_artifact_refs: unknown;
  ai_receipts: unknown;
  stage_updated_at: string;
}

const STATUS_CHIP: Record<AuditOrderStatus, { label: string; state: ChipState }> = {
  pending_payment: { label: "Payment pending", state: "warning" },
  paid: { label: "Paid", state: "success" },
  in_review: { label: "In review", state: "accent" },
  completed: { label: "Delivered", state: "success" },
  refunded: { label: "Refunded", state: "neutral" },
  cancelled: { label: "Cancelled", state: "neutral" },
};

function ageInDays(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

function autoLabel(generation: AuditGenerationItem): { label: string; state: ChipState } | null {
  if (generation.status === "QUEUED" || generation.status === "RUNNING") {
    if (generation.attempt_count > 1) {
      return { label: "AUTO — RETRYING", state: "warning" };
    }
    return { label: "AUTO — PROCESSING", state: "accent" };
  }
  if (generation.status === "NEEDS_REVIEW") {
    return { label: "AUTO — NEEDS REVIEW", state: "warning" };
  }
  if (generation.status === "COMPLETED") {
    return { label: "AUTO — COMPLETE", state: "success" };
  }
  return null;
}

function evidenceCount(generation: AuditGenerationItem): number | null {
  const research = generation.research_data;
  if (research && typeof research === "object" && !Array.isArray(research)) {
    const sources = (research as Record<string, unknown>).sources;
    if (Array.isArray(sources)) return sources.length;
  }
  if (Array.isArray(generation.evidence_artifact_refs)) {
    return generation.evidence_artifact_refs.length;
  }
  return null;
}

function researchSummarySnippet(generation: AuditGenerationItem): string | null {
  const research = generation.research_data;
  if (!research || typeof research !== "object" || Array.isArray(research)) return null;
  const summary = (research as Record<string, unknown>).summary;
  if (typeof summary !== "string") return null;
  const trimmed = summary.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
}

function safeProviderModels(generation: AuditGenerationItem): string[] {
  if (!Array.isArray(generation.ai_receipts)) return [];
  const labels: string[] = [];
  for (const item of generation.ai_receipts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const receipt = item as Record<string, unknown>;
    const provider = typeof receipt.provider === "string" ? receipt.provider.trim() : "";
    const model = typeof receipt.model === "string" ? receipt.model.trim() : "";
    if (!provider && !model) continue;
    const label = [provider, model].filter(Boolean).join(" / ");
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, 6);
}

function nextAction(order: AuditOrderItem, generation?: AuditGenerationItem): string {
  if (generation?.status === "NEEDS_REVIEW" || generation?.status === "FAILED") {
    return "Automatic generation needs recovery. Review the reason, retry safely, or deliver a staff-reviewed report.";
  }
  if (generation?.status === "QUEUED" || generation?.status === "RUNNING") {
    return `Automatic generation is at ${generation.stage.toLowerCase().replaceAll("_", " ")}. No staff action is required.`;
  }
  const state = deriveAuditCustomerState(order);
  if (state === "PAYMENT_PENDING") return "Wait for verified payment or help the customer resume checkout.";
  if (state === "INTAKE_REQUIRED") return "Customer needs to finish the required intake fields.";
  if (state === "READY_FOR_EXECUTION") return "Customer intake is complete; processing will start automatically.";
  if (state === "PROCESSING") return "Prepare and deliver the written report below if this is a staff-assisted order.";
  if (state === "NEEDS_ATTENTION") return "Completed record is missing a valid report; investigate before contacting the customer.";
  if (state === "DELIVERED") return "Report delivered. Offer the complimentary review call.";
  return "No delivery action is available for this closed order.";
}

export default async function AdminAuditRequestsPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const staff = await requirePlatformStaff(ctx.ownerId, ["platform_owner", "platform_admin", "audit_reviewer"]);
  if (!staff.ok) {
    return <ErrorState message="Platform audit staff authorization is required." />;
  }

  const service = getTenantServiceContext().supabase;
  const { data: orders, error } = await service
    .from("audit_orders")
    .select("id, tenant_id, user_id, guest_email, business_name, industry, website_url, status, audit_fee_cents, deep_dive_answers, goals_answers, report_data, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (orders ?? []) as AuditOrderItem[];
  const orderIds = list.map((order) => order.id);
  const { data: generationRows } = orderIds.length
    ? await service
        .from("audit_generation_runs")
        .select("id, audit_order_id, status, stage, brand_brain_version, attempt_count, recovery_count, quality_outcome, quality_score, failure_code, failure_message_safe, research_data, evidence_artifact_refs, ai_receipts, stage_updated_at")
        .in("audit_order_id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [] as AuditGenerationItem[] };
  const generationByOrder = new Map<string, AuditGenerationItem>();
  for (const row of (generationRows ?? []) as AuditGenerationItem[]) {
    if (!generationByOrder.has(row.audit_order_id)) generationByOrder.set(row.audit_order_id, row);
  }
  const deliveryResult = orderIds.length
    ? await service
        .from("audit_delivery_events")
        .select("audit_order_id, channel, status, destination_masked, created_at")
        .in("audit_order_id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ audit_order_id: string; channel: string; status: string; destination_masked?: string | null }>, error: null };
  const deliveryRows = deliveryResult.error ? [] : deliveryResult.data;
  const latestDelivery = new Map<string, string>();
  const latestWhatsAppMask = new Map<string, string>();
  for (const row of deliveryRows ?? []) {
    const key = `${row.audit_order_id}:${row.channel}`;
    if (!latestDelivery.has(key)) latestDelivery.set(key, row.status);
    if (row.channel === "whatsapp" && row.destination_masked && !latestWhatsAppMask.has(row.audit_order_id)) {
      latestWhatsAppMask.set(row.audit_order_id, row.destination_masked);
    }
  }
  const tenantIds = [...new Set(list.map((order) => order.tenant_id))];
  const { data: tenants } = tenantIds.length
    ? await service.from("tenants").select("id, name").in("id", tenantIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const tenantNames = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name]));
  const actionable = list.filter((order) => {
    const generation = generationByOrder.get(order.id);
    return ["paid", "in_review"].includes(order.status) &&
      (!generation || generation.status === "NEEDS_REVIEW" || generation.status === "FAILED");
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Audit Delivery</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          {list.length} paid-flow order{list.length === 1 ? "" : "s"} · {actionable} requiring action
        </p>
        <div className="mt-4"><AuditResetActions /></div>
      </header>

      {error && <ErrorState message="Could not load paid audit orders." />}
      {list.length === 0 && !error ? (
        <EmptyState title="No audit orders yet." subtitle="Customer audit orders will appear here." />
      ) : (
        <section className="grid gap-4">
          {list.map((order) => {
            const chip = STATUS_CHIP[order.status];
            const intakeComplete = isAuditIntakeComplete(order);
            const generation = generationByOrder.get(order.id);
            const auto = generation ? autoLabel(generation) : null;
            const sources = generation ? evidenceCount(generation) : null;
            const summary = generation ? researchSummarySnippet(generation) : null;
            const v1 = order.deep_dive_answers && typeof order.deep_dive_answers === "object"
              ? (order.deep_dive_answers as { v1Experience?: { step?: string; verified?: boolean; websiteUrl?: string } }).v1Experience
              : undefined;
            const whatsappStatus = latestDelivery.get(`${order.id}:whatsapp`) ?? "—";
            const whatsappMasked = latestWhatsAppMask.get(order.id);
            return (
              <Card key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sx-border pb-3">
                  <div>
                    <h2 className="font-sx-sans text-base font-semibold text-sx-text">{order.business_name}</h2>
                    <p className="mt-1 text-xs text-sx-text-muted">
                      {tenantNames.get(order.tenant_id) ?? "Workspace"}{order.guest_email ? ` · ${order.guest_email}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {auto && <StatusChip state={auto.state}>{auto.label}</StatusChip>}
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                  </div>
                </div>

                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-sx-text-subtle">Payment</dt><dd className="mt-1 text-sx-text">{order.status === "pending_payment" ? "Not confirmed" : `₹${(order.audit_fee_cents / 100).toLocaleString("en-IN")} confirmed`}</dd></div>
                  <div><dt className="text-sx-text-subtle">Intake</dt><dd className="mt-1 text-sx-text">{intakeComplete ? "Complete" : "Incomplete"}</dd></div>
                  <div><dt className="text-sx-text-subtle">Age</dt><dd className="mt-1 text-sx-text">{ageInDays(order.created_at)} day{ageInDays(order.created_at) === 1 ? "" : "s"}</dd></div>
                  <div><dt className="text-sx-text-subtle">Industry</dt><dd className="mt-1 text-sx-text">{order.industry || "Not provided"}</dd></div>
                </dl>

                <p className="mt-4 rounded-sx-sm bg-sx-surface-2 p-3 text-sm text-sx-text-muted">
                  <strong className="text-sx-text">Next action:</strong> {nextAction(order, generation)}
                </p>

                {generation && (
                  <dl className="mt-3 grid gap-2 rounded-sx-sm border border-sx-border p-3 text-xs sm:grid-cols-3">
                    <div><dt className="text-sx-text-subtle">Automatic run</dt><dd className="mt-1 text-sx-text">{generation.status} · {generation.stage}</dd></div>
                    <div><dt className="text-sx-text-subtle">Attempts</dt><dd className="mt-1 text-sx-text">{generation.attempt_count} · recoveries {generation.recovery_count}</dd></div>
                    <div><dt className="text-sx-text-subtle">Quality</dt><dd className="mt-1 text-sx-text">{generation.quality_outcome ?? "Pending"}{generation.quality_score != null ? ` · ${Math.round(Number(generation.quality_score) * 100)}` : ""}</dd></div>
                    <div><dt className="text-sx-text-subtle">Brand Brain</dt><dd className="mt-1 text-sx-text">v{generation.brand_brain_version}</dd></div>
                    <div><dt className="text-sx-text-subtle">Evidence / sources</dt><dd className="mt-1 text-sx-text">{sources == null ? "Unavailable" : sources}</dd></div>
                    <div><dt className="text-sx-text-subtle">Discovery</dt><dd className="mt-1 text-sx-text">{v1?.verified ? "Verified" : v1?.step ?? "Not started"}</dd></div>
                    <div><dt className="text-sx-text-subtle">WhatsApp</dt><dd className="mt-1 text-sx-text">{whatsappMasked ? `${whatsappMasked} · ${whatsappStatus}` : whatsappStatus}</dd></div>
                    {summary && (
                      <div className="sm:col-span-3">
                        <dt className="text-sx-text-subtle">Research summary</dt>
                        <dd className="mt-1 text-sx-text">{summary}</dd>
                      </div>
                    )}
                    {(generation.failure_message_safe || generation.failure_code) && (
                      <div className="sm:col-span-3">
                        <dt className="text-sx-text-subtle">Exception</dt>
                        <dd className="mt-1 text-sx-text">{generation.failure_message_safe ?? generation.failure_code}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {generation && (generation.status === "NEEDS_REVIEW" || generation.status === "FAILED") && (
                  <div className="mt-4"><AuditRecoveryActions runId={generation.id} /></div>
                )}
                {order.status === "in_review" && (!generation || generation.status === "NEEDS_REVIEW" || generation.status === "FAILED") && (
                  <div className="mt-4"><AuditDeliveryForm auditOrderId={order.id} tenantId={order.tenant_id} /></div>
                )}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
