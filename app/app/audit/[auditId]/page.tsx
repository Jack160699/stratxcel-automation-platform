import { redirect } from "next/navigation";

/**
 * Paid Audit has one canonical, state-driven customer hub. Historical links
 * recover there instead of rendering the retired foundation-only request UI.
 */
export default function LegacyAuditDetailRedirect() {
  redirect("/app/audit");
}
