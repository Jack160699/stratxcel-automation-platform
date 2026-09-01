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

import { isResolvedGbpLocationResourceName } from "../social/providers/google-business.ts";

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
  google_business_details?: {
    locationResolved: boolean;
    locationSetupRequired: boolean;
    businessTitle: string | null;
    address: string | null;
    category: string | null;
    mapsUrl: string | null;
    permission: string | null;
    googleEmail: string | null;
    // Real, additive facts from canonical-status.ts's own verification
    // computation (STRATXCEL — GOOGLE BUSINESS AUTONOMOUS SETUP brief,
    // Section 9/19) -- only meaningful once locationResolved is true.
    // Deliberately not folded into `google` (ConnectorState): this codebase
    // already established the "companion details object" pattern for
    // Google Business here (locationResolved/locationSetupRequired above)
    // rather than growing the shared ConnectorState enum per-provider.
    verificationRequired: boolean;
    verificationPending: boolean;
    verificationMessage: string | null;
    // Real discovery outcome already captured by google-business.ts's
    // exchangeCodeForToken/the google-business probe route
    // (metadata.discovery_status) but never read by anything until now --
    // only meaningful when locationSetupRequired is true. Lets the UI say
    // exactly what happened (no account at all vs. accounts with no
    // locations vs. locations found but none matched) instead of one
    // generic "location setup required" message for all three (STRATXCEL —
    // MASTER AUTONOMOUS GROWTH PLATFORM brief, Section 29).
    discoveryStatus: "NO_GBP_ACCOUNTS_FOUND" | "NO_LOCATIONS_IN_ACCOUNTS" | "LOCATION_SELECTION_REQUIRED" | "LOCATION_MATCHED" | null;
    accountsCount: number | null;
    locationsCount: number | null;
  };
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
  const [presenceSummary, socialRes] = await Promise.all([
    getTenantDigitalPresence(service, tenantId),
    service
      .from("social_accounts")
      .select("platform, provider_account_id, username, display_name, status, metadata")
      .eq("tenant_id", tenantId),
  ]);

  const conns = presenceSummary.connections;
  const socialRows = socialRes.data ?? [];

  const gbSocial = socialRows.find(
    (r) => String(r.platform).toLowerCase() === "google_business" || String(r.platform).toLowerCase() === "google"
  );
  const gbMeta = (gbSocial?.metadata ?? {}) as Record<string, unknown>;
  const gbLocationResolved = Boolean(
    conns.google_business.connectionState === "CONNECTED" &&
    isResolvedGbpLocationResourceName(conns.google_business.externalAccountId ?? "")
  );
  const gbLocationSetupRequired = Boolean(
    conns.google_business.connectionState === "CONNECTED" && !gbLocationResolved
  );

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
    google_business_details: {
      locationResolved: gbLocationResolved,
      locationSetupRequired: gbLocationSetupRequired,
      businessTitle: conns.google_business.displayName || (gbMeta.business_title as string) || (gbLocationResolved ? "StratXcel" : null),
      address: (gbMeta.business_address as string) || null,
      category: (gbMeta.business_category as string) || null,
      mapsUrl: conns.google_business.publicUrl || (gbMeta.maps_url as string) || null,
      permission: (gbMeta.permission_level as string) || (gbLocationResolved ? "OWNER_ACCESS" : "ACCOUNT_AUTHENTICATED"),
      googleEmail: (gbMeta.google_email as string) || gbSocial?.username || null,
      verificationRequired: Boolean(conns.google_business.verificationRequired),
      verificationPending: Boolean(conns.google_business.verificationPending),
      verificationMessage: conns.google_business.verificationMessage ?? null,
      discoveryStatus: (typeof gbMeta.discovery_status === "string" ? gbMeta.discovery_status : null) as
        | "NO_GBP_ACCOUNTS_FOUND"
        | "NO_LOCATIONS_IN_ACCOUNTS"
        | "LOCATION_SELECTION_REQUIRED"
        | "LOCATION_MATCHED"
        | null,
      accountsCount: typeof gbMeta.accounts_count === "number" ? gbMeta.accounts_count : null,
      locationsCount: typeof gbMeta.locations_count === "number" ? gbMeta.locations_count : null,
    },
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
