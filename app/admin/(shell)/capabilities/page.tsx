import type { Metadata } from "next";
import { requireReleaseAccess } from "@/lib/release/require-release-access";
import { getServiceContext } from "@/lib/social/db-context";
import { CapabilitiesClient, type CapabilityItem } from "./CapabilitiesClient";

export const metadata: Metadata = {
  title: "Capability Registry — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const STATUS_ORDER = [
  "REAL_EXPOSED",
  "PARTIAL",
  "REAL_NOT_EXPOSED",
  "NOT_BUILT",
  "EXTERNAL_REQUIRED",
  "BROKEN",
] as const;

export default async function CapabilityRegistryPage() {
  await requireReleaseAccess("v2");

  const { supabase } = getServiceContext();
  const { data } = await supabase
    .from("capability_registry")
    .select(
      "capability_key, name, description, category, status, status_notes, external_blocker, agent_tool_name, last_verified_at",
    )
    .order("status", { ascending: true })
    .order("capability_key", { ascending: true });

  const rows = (data ?? []) as CapabilityItem[];
  const countsByStatus = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter((r) => r.status === s).length;
    return acc;
  }, {});

  return <CapabilitiesClient capabilities={rows} countsByStatus={countsByStatus} />;
}
