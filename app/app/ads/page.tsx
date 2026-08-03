import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function AdsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="Ads"
      note="Genuinely new capability — no backend exists for this yet. Flagged in docs/product-design/CLIENT_APP_INFORMATION_ARCHITECTURE.md §5."
    />
  );
}
