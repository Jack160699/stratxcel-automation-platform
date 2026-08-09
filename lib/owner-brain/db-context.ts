/**
 * Owner Operating Brain reuses the exact same owner-auth gate Social
 * Autopilot already has (requireOwnerContext / getServiceContext /
 * OwnerContext) rather than inventing a second one — both features are
 * the same "single StratExcel owner, stratxcel_admins-gated" data shape,
 * just different tables. See lib/social/db-context.ts for the RLS
 * rationale this mirrors.
 */
export { requireOwnerContext, getServiceContext } from "@/lib/social/db-context";
export type { OwnerContext, OwnerContextError } from "@/lib/social/db-context";

import { getServiceContext } from "@/lib/social/db-context";

/** Every admin user_id in stratxcel_admins — in practice exactly one (Shriyansh), but cron jobs iterate this rather than hardcoding an id. */
export async function listAdminOwnerIds(): Promise<string[]> {
  const { data, error } = await getServiceContext().supabase.from("stratxcel_admins").select("user_id");
  if (error) throw new Error(`listAdminOwnerIds failed: ${error.message}`);
  return (data ?? []).map((row) => row.user_id as string);
}

/** IST is UTC+5:30 with no DST — a fixed offset is correct, not a simplification. */
export function currentIstDateString(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
