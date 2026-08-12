import { requireOwnerContext, getServiceContext } from "@/lib/social/db-context";
import { Card, CardHeading } from "@/components/ui/Card";

export default async function AdminTeamPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { supabase } = getServiceContext();
  const { data: admins } = await supabase.from("stratxcel_admins").select("user_id");
  const adminIds = (admins ?? []).map((row) => row.user_id);
  const { data: dualMemberships } = adminIds.length
    ? await supabase
        .from("tenant_members")
        .select("user_id, role, tenant:tenants(id, name, slug)")
        .in("user_id", adminIds)
        .order("created_at", { ascending: true })
    : { data: [] };

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
              <thead><tr className="text-sx-text-subtle"><th className="pb-2 pr-4">Staff user</th><th className="pb-2 pr-4">Client</th><th className="pb-2">Membership role</th></tr></thead>
              <tbody>
                {(dualMemberships ?? []).map((membership) => {
                  const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant;
                  return (
                    <tr key={`${membership.user_id}:${tenant?.id ?? "unknown"}`} className="border-t border-sx-border">
                      <td className="py-2 pr-4 font-mono text-[11px]">{membership.user_id}</td>
                      <td className="py-2 pr-4">{tenant?.name ?? "Unknown client"} <span className="text-sx-text-subtle">{tenant?.slug}</span></td>
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
