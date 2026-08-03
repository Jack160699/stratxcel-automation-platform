import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function ReportsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return <FoundationPage title="Reports" note="No report-generation backend exists yet — not wired up." />;
}
