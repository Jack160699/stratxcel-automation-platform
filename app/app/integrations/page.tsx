import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function IntegrationsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="Integrations"
      note="The underlying WhatsApp phone-binding API (/api/platform/whatsapp/bindings) already works and is tenant-scoped — this page just hasn't been built to call it yet. Not a backend gap, an unfinished page."
    />
  );
}
