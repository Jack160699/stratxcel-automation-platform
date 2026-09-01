import { type SupabaseClient } from "@supabase/supabase-js";
import { getTenantDigitalPresence } from "./canonical-status.ts";
import type { PlatformIconKey } from "@/components/audit/PlatformIcon";

export type ConnectorState =
  | "checking"
  | "connected"
  | "action_required"
  | "setup_required"
  | "discovered_public"
  | "testing_access_required";

import type { VercelWriteCapabilityState } from "../../packages/search-discovery/src/execution/cms/vercel-write-resolver.ts";

export interface CustomerIntegrationStatus {
  website?: {
    state: ConnectorState;
    url: string;
    platform: string;
    vercelProject: string;
    vercelStatus: string;
    writeCapability: VercelWriteCapabilityState;
    writeReady: boolean;
    automaticChangesReady: boolean;
  };
  whatsapp: ConnectorState;
  facebook: ConnectorState;
  instagram: ConnectorState;
  youtube: ConnectorState;
  google: ConnectorState;
  google_analytics?: ConnectorState;
  google_search_console?: ConnectorState;
  threads?: ConnectorState;
  linkedin?: ConnectorState;
  presence?: Array<{
    key: PlatformIconKey;
    label: string;
    handle: string | null;
    href: string | null;
    provenance: string;
    lastSync: string | null;
  }>;
  selfService?: { google?: boolean; social?: boolean; whatsapp?: boolean };
}

export async function loadIntegrationsStatusData(
  service: SupabaseClient,
  tenantId: string,
  role?: string | null
): Promise<CustomerIntegrationStatus> {
  const presenceSummary = await getTenantDigitalPresence(service, tenantId);
  const conns = presenceSummary.connections;

  const mapState = (state: string): ConnectorState => {
    if (state === "CONNECTED") return "connected";
    if (state === "REAUTH_REQUIRED" || state === "ERROR") return "action_required";
    if (state === "DISCOVERED_PUBLICLY") return "discovered_public";
    return "setup_required";
  };

  const presenceList = Object.values(conns).map((c) => ({
    key: c.provider as PlatformIconKey,
    label: c.title,
    handle: c.handle,
    href: c.publicUrl,
    provenance: c.provenance,
    lastSync: c.lastSyncedAt,
  }));

  const canDirectConnect = role === "owner" || role === "admin";

  const isWriteReady = conns.website.writeCapability === "WRITE_READY";

  return {
    website: {
      state: mapState(conns.website.connectionState),
      url: conns.website.publicUrl || "https://www.stratxcel.in",
      platform: conns.website.platform || "nextjs",
      vercelProject: conns.website.projectName || "stratxcel",
      vercelStatus: "READY",
      writeCapability: conns.website.writeCapability || (isWriteReady ? "WRITE_READY" : "READ_ONLY"),
      writeReady: isWriteReady,
      automaticChangesReady: isWriteReady,
    },
    whatsapp: mapState(conns.whatsapp.connectionState),
    facebook: mapState(conns.facebook.connectionState),
    instagram: mapState(conns.instagram.connectionState),
    youtube: mapState(conns.youtube.connectionState),
    google: mapState(conns.google_business.connectionState),
    google_analytics: mapState(conns.google_analytics.connectionState),
    google_search_console: mapState(conns.google_search_console.connectionState),
    presence: presenceList,
    selfService: {
      google: true,
      social: canDirectConnect,
      whatsapp: false,
    },
  };
}
