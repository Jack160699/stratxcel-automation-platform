import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getLocalAIConnectionStatus } from "@/lib/local-ai/connection";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { LocalAIConnectionPanel } from "./LocalAIConnectionPanel";

/**
 * Admin Dashboard -> System -> Local AI.
 *
 * The admin-facing pairing/status UI for the owner's remote, self-hosted
 * Local AI server (see lib/local-ai/connection.ts's header for the real
 * pairing contract this page's actions call into). Complements System
 * Health's existing read-only "AI Runtime (Local)" row -- this page is
 * where the actual connect/reconnect/disconnect actions live.
 */
export default async function LocalAIPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-sx-text-muted">Not authenticated.</p>;

  const staffAuth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return <p className="text-sm text-sx-text-muted">{staffAuth.error}</p>;

  const service = createSupabaseServiceClient();
  const connection = await getLocalAIConnectionStatus(service);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "System", href: "/admin/system" }, { label: "Local AI" }]}
        title="Local AI"
        description="Pair and monitor the owner’s self-hosted Local AI server for general AI fallback (chat, coding, website, reasoning). Never used for image generation — that is cloud-only."
      />
      <LocalAIConnectionPanel initialConnection={connection} />
    </div>
  );
}
