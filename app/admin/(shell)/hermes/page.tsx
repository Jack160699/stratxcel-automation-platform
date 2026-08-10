import { requireReleaseAccess } from "@/lib/release/require-release-access";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import HermesMissionControl from "./HermesMissionControl";

/**
 * Hermes Mission Control — V2 owner/admin surface.
 * Shared Hermes workers/runtime used by V1 remain untouched; only this
 * advanced control UI is Beta-gated.
 */
export default async function HermesPage() {
  const ctx = await requireReleaseAccess("v2");
  const auth = await requirePlatformStaff(ctx.ownerId, ["platform_owner", "platform_admin"]);
  if (!auth.ok) {
    return (
      <div className="rounded-sx-md border border-sx-border p-6 text-sm text-sx-text-muted">
        Platform staff authorization is required.
      </div>
    );
  }
  return <HermesMissionControl />;
}
