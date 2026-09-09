import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { fetchOfficeTelemetry } from "@/lib/office/office-telemetry-service";
import { OfficeWorkspace } from "./OfficeWorkspace";

export const metadata: Metadata = {
  title: "Office — Stratxcel Admin",
  description: "Digital headquarters and live AI workforce visual command center.",
  robots: { index: false, follow: false },
};

export default async function OfficePage() {
  const identity = await resolveCanonicalIdentity({ routeSurface: "admin" });
  if (identity.state === "NO_SESSION") redirect("/admin");
  if (identity.state === "CUSTOMER_MEMBER" || identity.state === "NEW_CUSTOMER") redirect("/app");

  const { active } = await resolveCurrentTenant(identity.supabase, identity.userId);
  const tenantId =
    identity.state === "STAFF_VIEWING_CLIENT"
      ? identity.staffWorkspace.tenantId
      : active?.tenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";

  const tenantName =
    identity.state === "STAFF_VIEWING_CLIENT"
      ? identity.staffWorkspace.name
      : active?.name || "Stratxcel";

  // Use service context to read live telemetry for the authorized tenant
  const { supabase } = getTenantServiceContext();
  const initialTelemetry = await fetchOfficeTelemetry(supabase, tenantId, tenantName);

  return (
    <div className="w-full">
      <OfficeWorkspace initialTelemetry={initialTelemetry} />
    </div>
  );
}
