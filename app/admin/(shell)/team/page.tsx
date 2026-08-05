import { requireOwnerContext } from "@/lib/social/db-context";
import { AdminFoundationPage } from "../AdminFoundationPage";

export default async function AdminTeamPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;
  return (
    <AdminFoundationPage
      title="Team"
      note="Agency staff roster and role management — stratxcel_admins currently has no listing RLS policy or invite flow. Needs a stratxcel_admins_self_and_peers_read policy plus an invite API before this can show real rows."
    />
  );
}
