import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function FilesPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return <FoundationPage title="Files" note="No artifact-listing API route exists yet for this view — not wired up." />;
}
