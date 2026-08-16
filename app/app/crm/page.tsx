import { redirect } from "next/navigation";

/**
 * /app/crm is removed from the V1 client panel.
 * All customer CRM access redirects to the Command Center overview.
 */
export default function CrmPage() {
  redirect("/app");
}
