import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function CrmPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="CRM & Leads"
      note="The @stratxcel/leads-and-crm package and its LeadRow/LeadStatus data model already exist, but no API route exposes it yet — this page has no backend to call. Wiring app/api/platform/leads/* is the next real step here, not a rebuild."
    />
  );
}
