import { requireClientContext } from "@/lib/tenants/client-context";
import { loadAuditHubData } from "@/lib/audit/load-hub-data";
import { AuditHubClient } from "./AuditHubClient";

export const dynamic = "force-dynamic";

export default async function AuditHubPage() {
  const clientCtx = await requireClientContext();
  if (!clientCtx.ok) return null;

  const tenantId = clientCtx.workspaceTenant.tenantId;
  const initialData = await loadAuditHubData(clientCtx.supabase, tenantId);

  return <AuditHubClient initialData={initialData} />;
}
