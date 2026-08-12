import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/social/db-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { deriveAuditCustomerState, isAuditIntakeComplete, type AuditOrderStatus } from "@/lib/audit/customer-state";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { Card } from "@/components/ui/Card";
import { AuditDeliveryForm } from "./AuditDeliveryForm";

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

function nextAction(order: AuditOrderItem): string {
  const state = deriveAuditCustomerState(order);
  if (state === "PAYMENT_PENDING") return "Wait for verified payment or help the customer resume checkout.";
  if (state === "INTAKE_REQUIRED") return "Customer needs to finish the required intake fields.";
  if (state === "READY_FOR_EXECUTION") return "Customer intake is complete; ask them to start the review.";
  if (state === "PROCESSING") return "Prepare and deliver the written report below.";
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
  const tenantIds = [...new Set(list.map((order) => order.tenant_id))];
  const { data: tenants } = tenantIds.length
    ? await service.from("tenants").select("id, name").in("id", tenantIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const tenantNames = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name]));
  const actionable = list.filter((order) => ["paid", "in_review"].includes(order.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Audit Delivery</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          {list.length} paid-flow order{list.length === 1 ? "" : "s"} · {actionable} requiring action
        </p>
      </header>

      {error && <ErrorState message="Could not load paid audit orders." />}
      {list.length === 0 && !error ? (
        <EmptyState title="No paid-flow audit orders yet." subtitle="New ₹999 Audit checkouts will appear here." />
      ) : (
        <section className="grid gap-4">
          {list.map((order) => {
            const chip = STATUS_CHIP[order.status];
            const intakeComplete = isAuditIntakeComplete(order);
            return (
              <Card key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sx-border pb-3">
                  <div>
                    <h2 className="font-sx-sans text-base font-semibold text-sx-text">{order.business_name}</h2>
                    <p className="mt-1 text-xs text-sx-text-muted">
                      {tenantNames.get(order.tenant_id) ?? "Workspace"}{order.guest_email ? ` · ${order.guest_email}` : ""}
                    </p>
                  </div>
                  <StatusChip state={chip.state}>{chip.label}</StatusChip>
                </div>

                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-sx-text-subtle">Payment</dt><dd className="mt-1 text-sx-text">{order.status === "pending_payment" ? "Not confirmed" : `₹${(order.audit_fee_cents / 100).toLocaleString("en-IN")} confirmed`}</dd></div>
                  <div><dt className="text-sx-text-subtle">Intake</dt><dd className="mt-1 text-sx-text">{intakeComplete ? "Complete" : "Incomplete"}</dd></div>
                  <div><dt className="text-sx-text-subtle">Age</dt><dd className="mt-1 text-sx-text">{ageInDays(order.created_at)} day{ageInDays(order.created_at) === 1 ? "" : "s"}</dd></div>
                  <div><dt className="text-sx-text-subtle">Industry</dt><dd className="mt-1 text-sx-text">{order.industry || "Not provided"}</dd></div>
                </dl>

                <p className="mt-4 rounded-sx-sm bg-sx-surface-2 p-3 text-sm text-sx-text-muted">
                  <strong className="text-sx-text">Next action:</strong> {nextAction(order)}
                </p>

                {order.status === "in_review" && <div className="mt-4"><AuditDeliveryForm auditOrderId={order.id} tenantId={order.tenant_id} /></div>}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
