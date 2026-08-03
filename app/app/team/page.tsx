import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function TeamPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="Team"
      note="inviteMember() already exists server-side (lib/tenants/repository.ts) but has no API route or UI wired up yet for the client-facing invite flow."
    />
  );
}
