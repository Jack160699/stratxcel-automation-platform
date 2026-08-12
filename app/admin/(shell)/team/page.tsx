import { requireOwnerContext, getServiceContext } from "@/lib/social/db-context";
import { Card, CardHeading } from "@/components/ui/Card";

export default async function AdminTeamPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { supabase } = getServiceContext();
  const [{ data: staffRows }, { data: dualMemberships }] = await Promise.all([
    supabase.from("platform_staff_users").select("user_id, role, is_active").eq("is_active", true),
    supabase
      .from("tenant_members")
      .select("user_id, role, tenant:tenants(id, name, slug)")
      .in(
        "user_id",
        (
          await supabase.from("stratxcel_admins").select("user_id")
        ).data?.map((row) => row.user_id) ?? []
      )
      .order("created_at", { ascending: true }),
  ]);

  const staffById = new Map((staffRows ?? []).map((row) => [row.user_id, row]));
  const userIds = [...new Set((dualMemberships ?? []).map((row) => row.user_id))];
  const profiles = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        return {
          userId,
          email: data.user?.email ?? null,
          name: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
          staffRole: staffById.get(userId)?.role ?? null,
        };
      } catch {
        return { userId, email: null, name: null, staffRole: staffById.get(userId)?.role ?? null };
      }
    })
  );
  const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Team</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Internal access diagnostics. No memberships are changed automatically.</p>
      </header>
      <Card className="p-5">
        <CardHeading>Staff with client memberships</CardHeading>
        <p className="mt-1 text-xs text-sx-text-subtle">Review these support or owner relationships intentionally. Staff identity still takes precedence for routing.</p>
        {(dualMemberships ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-sx-text-muted">No dual memberships found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-sx-text-subtle">
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Platform role</th>
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2">Membership role</th>
                </tr>
              </thead>
              <tbody>
                {(dualMemberships ?? []).map((membership) => {
                  const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant;
                  const profile = profileById.get(membership.user_id);
                  const displayName = profile?.name || profile?.email || "Unknown staff";
                  return (
                    <tr key={`${membership.user_id}:${tenant?.id ?? "unknown"}`} className="border-t border-sx-border">
                      <td className="py-2 pr-4">
                        <p className="font-medium text-sx-text">{displayName}</p>
                        {profile?.email && <p className="text-sx-text-subtle">{profile.email}</p>}
                        <p className="font-mono text-[10px] text-sx-text-subtle" title={membership.user_id}>
                          ID {membership.user_id.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="py-2 pr-4 capitalize">{profile?.staffRole?.replaceAll("_", " ") ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {tenant?.name ?? "Unknown client"} <span className="text-sx-text-subtle">{tenant?.slug}</span>
                      </td>
                      <td className="py-2 capitalize">{membership.role}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
