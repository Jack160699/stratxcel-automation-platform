import { redirect } from "next/navigation";

/**
 * Deep links into /app/crm/[leadId] are removed from the V1 client panel.
 * Redirects to the Command Center overview.
 */
export default function LeadDetailPage() {
  redirect("/app");
}
