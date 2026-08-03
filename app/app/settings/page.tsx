import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function SettingsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return <FoundationPage title="Settings" note="No tenant-profile-editing API route exists yet — not wired up." />;
}
