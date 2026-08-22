import { cache } from "react";

export function isMissingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST205"
    || /schema cache|does not exist|could not find the table/i.test(error.message ?? "");
}

/**
 * undefined = table/row not ready, caller may fall back to latest order.
 * null = this tenant's current Audit was archived and must not be shown as current.
 * string = current order id.
 */
export const resolveCurrentAuditOrderId = cache(async function resolveCurrentAuditOrderId(
  service: { from: (table: string) => unknown },
  tenantId: string,
): Promise<string | null | undefined> {
  const table = service.from("tenant_current_audits") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { current_audit_order_id?: string | null } | null;
          error: { message?: string; code?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await table
    .select("current_audit_order_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return undefined;
  return data.current_audit_order_id ?? null;
});

