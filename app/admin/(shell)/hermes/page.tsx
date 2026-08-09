import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import HermesMissionControl from "./HermesMissionControl";

export default async function HermesPage() {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return null;
  const auth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!auth.ok) return <div className="rounded-sx-md border border-sx-border p-6 text-sm text-sx-text-muted">Platform staff authorization is required.</div>;
  return <HermesMissionControl />;
}
