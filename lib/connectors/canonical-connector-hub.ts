/**
 * StratXcel Canonical Connector Hub.
 * Single unified model for Provider Authorization, Asset Discovery, Asset Selection,
 * Capability Registration, Token Health, and Downstream Agent Access.
 *
 * Flow:
 * CONNECT ONCE -> AUTHORIZE -> DISCOVER ASSETS -> SELECT ASSETS -> SAVE SECURELY -> SYNC -> USE THROUGHOUT STRATXCEL
 */

export type ProviderId = "google" | "meta" | "linkedin" | "youtube" | "whatsapp" | "website";

export type AssetCategory =
  | "ga4_property"
  | "search_console_site"
  | "google_business_location"
  | "google_ads_account"
  | "youtube_channel"
  | "facebook_page"
  | "instagram_profile"
  | "threads_profile"
  | "meta_ads_account"
  | "linkedin_page"
  | "whatsapp_business"
  | "website_domain";

export type CapabilityType = "READ" | "WRITE" | "PUBLISH" | "ANALYTICS" | "SPEND_MANAGED";

export type ConnectionStatus =
  | "CONNECTED"
  | "PARTIAL"
  | "VERIFICATION_REQUIRED"
  | "REAUTH_REQUIRED"
  | "NOT_CONNECTED"
  | "PROVIDER_BLOCKED";

export interface DiscoveredAsset {
  id: string;
  category: AssetCategory;
  provider: ProviderId;
  name: string;
  externalId: string;
  details?: Record<string, unknown>;
  capabilities: CapabilityType[];
  isSelected: boolean;
  verificationStatus?: "VERIFIED" | "PENDING" | "VERIFICATION_REQUIRED" | "UNVERIFIED";
}

export interface ProviderAuthorization {
  tenantId: string;
  provider: ProviderId;
  status: ConnectionStatus;
  externalAccountId?: string;
  accountEmailOrName?: string;
  grantedScopes: string[];
  connectedAt?: string;
  lastSyncAt?: string;
  tokenHealth: "HEALTHY" | "EXPIRING_SOON" | "EXPIRED" | "REVOKED";
  discoveredAssets: DiscoveredAsset[];
  selectedAssetIds: string[];
  activeCapabilities: CapabilityType[];
}

export interface AssetSelectionInput {
  tenantId: string;
  provider: ProviderId;
  selectedAssetIds: string[];
}

export interface GoogleDiscoveryResult {
  identity: { email: string; name: string };
  ga4Properties: DiscoveredAsset[];
  searchConsoleSites: DiscoveredAsset[];
  businessLocations: DiscoveredAsset[];
  adsAccounts: DiscoveredAsset[];
  youtubeChannels: DiscoveredAsset[];
}

export interface MetaDiscoveryResult {
  identity: { name: string; userId: string };
  facebookPages: DiscoveredAsset[];
  instagramProfiles: DiscoveredAsset[];
  threadsProfiles: DiscoveredAsset[];
  adsAccounts: DiscoveredAsset[];
}

export interface LinkedInDiscoveryResult {
  identity: { name: string; memberId: string };
  companyPages: DiscoveredAsset[];
}

/**
 * In-memory / cache store for tenant provider authorizations during test & runtime.
 */
const IN_MEMORY_CONNECTIONS = new Map<string, Map<ProviderId, ProviderAuthorization>>();

function getTenantStore(tenantId: string): Map<ProviderId, ProviderAuthorization> {
  let store = IN_MEMORY_CONNECTIONS.get(tenantId);
  if (!store) {
    store = new Map<ProviderId, ProviderAuthorization>();
    IN_MEMORY_CONNECTIONS.set(tenantId, store);
  }
  return store;
}

/**
 * Discovers Google assets across all supported Google services under a single Google OAuth authorization.
 */
export async function discoverGoogleAssets(
  accessToken: string,
  mockData?: Partial<GoogleDiscoveryResult>,
): Promise<GoogleDiscoveryResult> {
  // If mock data provided (e.g. in test or sandbox), return cleanly structured discovered assets
  if (mockData) {
    return {
      identity: mockData.identity ?? { email: "owner@stratxcel.in", name: "StratXcel Admin" },
      ga4Properties: mockData.ga4Properties ?? [
        {
          id: "ga4-1",
          category: "ga4_property",
          provider: "google",
          name: "StratXcel Main GA4 (987654321)",
          externalId: "properties/987654321",
          capabilities: ["READ", "ANALYTICS"],
          isSelected: true,
        },
      ],
      searchConsoleSites: mockData.searchConsoleSites ?? [
        {
          id: "gsc-1",
          category: "search_console_site",
          provider: "google",
          name: "https://www.stratxcel.in/",
          externalId: "https://www.stratxcel.in/",
          capabilities: ["READ", "ANALYTICS"],
          isSelected: true,
          verificationStatus: "VERIFIED",
        },
      ],
      businessLocations: mockData.businessLocations ?? [
        {
          id: "gbp-1",
          category: "google_business_location",
          provider: "google",
          name: "StratXcel Technologies - Main Office",
          externalId: "locations/1234567890",
          capabilities: ["READ", "WRITE", "PUBLISH", "ANALYTICS"],
          isSelected: true,
          verificationStatus: "VERIFIED",
        },
      ],
      adsAccounts: mockData.adsAccounts ?? [
        {
          id: "gads-1",
          category: "google_ads_account",
          provider: "google",
          name: "StratXcel Growth Ads (123-456-7890)",
          externalId: "123-456-7890",
          capabilities: ["READ", "ANALYTICS", "SPEND_MANAGED"],
          isSelected: false,
        },
      ],
      youtubeChannels: mockData.youtubeChannels ?? [
        {
          id: "yt-1",
          category: "youtube_channel",
          provider: "google",
          name: "StratXcel Official",
          externalId: "UC_stratxcel_official",
          capabilities: ["READ", "PUBLISH", "ANALYTICS"],
          isSelected: true,
        },
      ],
    };
  }

  // Live discovery implementation placeholder
  return {
    identity: { email: "owner@stratxcel.in", name: "Google User" },
    ga4Properties: [],
    searchConsoleSites: [],
    businessLocations: [],
    adsAccounts: [],
    youtubeChannels: [],
  };
}

/**
 * Discovers Meta assets across Facebook Pages, Instagram, Threads, and Ad Accounts under single Meta OAuth.
 */
export async function discoverMetaAssets(
  accessToken: string,
  mockData?: Partial<MetaDiscoveryResult>,
): Promise<MetaDiscoveryResult> {
  if (mockData) {
    return {
      identity: mockData.identity ?? { name: "StratXcel Technologies", userId: "meta-user-123" },
      facebookPages: mockData.facebookPages ?? [
        {
          id: "fb-page-1",
          category: "facebook_page",
          provider: "meta",
          name: "StratXcel Technologies Official",
          externalId: "10987654321",
          capabilities: ["READ", "WRITE", "PUBLISH", "ANALYTICS"],
          isSelected: true,
        },
      ],
      instagramProfiles: mockData.instagramProfiles ?? [
        {
          id: "ig-prof-1",
          category: "instagram_profile",
          provider: "meta",
          name: "@stratxcel",
          externalId: "17841400000000",
          capabilities: ["READ", "WRITE", "PUBLISH", "ANALYTICS"],
          isSelected: true,
        },
      ],
      threadsProfiles: mockData.threadsProfiles ?? [
        {
          id: "th-prof-1",
          category: "threads_profile",
          provider: "meta",
          name: "@stratxcel",
          externalId: "threads-17841400000000",
          capabilities: ["READ", "WRITE", "PUBLISH", "ANALYTICS"],
          isSelected: true,
        },
      ],
      adsAccounts: mockData.adsAccounts ?? [
        {
          id: "mads-1",
          category: "meta_ads_account",
          provider: "meta",
          name: "StratXcel Meta Ads (act_12345678)",
          externalId: "act_12345678",
          capabilities: ["READ", "ANALYTICS", "SPEND_MANAGED"],
          isSelected: false,
        },
      ],
    };
  }

  return {
    identity: { name: "Meta User", userId: "user-123" },
    facebookPages: [],
    instagramProfiles: [],
    threadsProfiles: [],
    adsAccounts: [],
  };
}

/**
 * Discovers LinkedIn assets (Member Profile & Organization Pages).
 */
export async function discoverLinkedInAssets(
  accessToken: string,
  mockData?: Partial<LinkedInDiscoveryResult>,
): Promise<LinkedInDiscoveryResult> {
  if (mockData) {
    return {
      identity: mockData.identity ?? { name: "StratXcel Founder", memberId: "urn:li:person:xyz" },
      companyPages: mockData.companyPages ?? [
        {
          id: "li-org-1",
          category: "linkedin_page",
          provider: "linkedin",
          name: "StratXcel Technologies Inc.",
          externalId: "urn:li:organization:1234567",
          capabilities: ["READ", "WRITE", "PUBLISH", "ANALYTICS"],
          isSelected: true,
        },
      ],
    };
  }

  return {
    identity: { name: "LinkedIn Member", memberId: "member-1" },
    companyPages: [],
  };
}

/**
 * Registers an authorized provider connection for a tenant and binds selected assets.
 */
export async function registerProviderConnection(
  input: ProviderAuthorization,
): Promise<ProviderAuthorization> {
  const store = getTenantStore(input.tenantId);

  // Compute active capabilities derived from selected assets
  const activeCapabilities = new Set<CapabilityType>();
  for (const asset of input.discoveredAssets) {
    if (input.selectedAssetIds.includes(asset.id)) {
      asset.isSelected = true;
      for (const cap of asset.capabilities) {
        activeCapabilities.add(cap);
      }
    } else {
      asset.isSelected = false;
    }
  }

  const record: ProviderAuthorization = {
    ...input,
    activeCapabilities: Array.from(activeCapabilities),
    status: input.status ?? "CONNECTED",
    tokenHealth: input.tokenHealth ?? "HEALTHY",
    connectedAt: input.connectedAt ?? new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
  };

  store.set(input.provider, record);
  return record;
}

/**
 * Retrieves the stored provider connection for a tenant.
 */
export async function getProviderConnection(
  tenantId: string,
  provider: ProviderId,
): Promise<ProviderAuthorization | null> {
  const store = getTenantStore(tenantId);
  return store.get(provider) ?? null;
}

/**
 * Updates selected assets without forcing re-authentication.
 */
export async function updateSelectedAssets(
  input: AssetSelectionInput,
): Promise<ProviderAuthorization> {
  const existing = await getProviderConnection(input.tenantId, input.provider);
  if (!existing) {
    throw new Error(`Provider ${input.provider} is not connected for tenant ${input.tenantId}`);
  }

  const updatedAssets = existing.discoveredAssets.map((asset) => ({
    ...asset,
    isSelected: input.selectedAssetIds.includes(asset.id),
  }));

  const activeCaps = new Set<CapabilityType>();
  for (const asset of updatedAssets) {
    if (asset.isSelected) {
      for (const cap of asset.capabilities) {
        activeCaps.add(cap);
      }
    }
  }

  const updated: ProviderAuthorization = {
    ...existing,
    discoveredAssets: updatedAssets,
    selectedAssetIds: input.selectedAssetIds,
    activeCapabilities: Array.from(activeCaps),
    lastSyncAt: new Date().toISOString(),
  };

  const store = getTenantStore(input.tenantId);
  store.set(input.provider, updated);
  return updated;
}

/**
 * Disconnects a provider connection safely.
 */
export async function disconnectProvider(
  tenantId: string,
  provider: ProviderId,
): Promise<{ ok: true; disconnectedAt: string }> {
  const store = getTenantStore(tenantId);
  const existing = store.get(provider);
  if (existing) {
    store.set(provider, {
      ...existing,
      status: "NOT_CONNECTED",
      tokenHealth: "REVOKED",
      selectedAssetIds: [],
      activeCapabilities: [],
      discoveredAssets: existing.discoveredAssets.map((a) => ({ ...a, isSelected: false })),
    });
  }
  return { ok: true, disconnectedAt: new Date().toISOString() };
}

/**
 * Checks whether a tenant is authorized for a specific capability on an asset category.
 */
export async function isCapabilityAuthorized(
  tenantId: string,
  provider: ProviderId,
  category: AssetCategory,
  capability: CapabilityType,
): Promise<{ authorized: boolean; reason?: string }> {
  const connection = await getProviderConnection(tenantId, provider);
  if (!connection || connection.status !== "CONNECTED") {
    return { authorized: false, reason: `Provider ${provider} is not connected` };
  }

  if (connection.tokenHealth === "EXPIRED" || connection.tokenHealth === "REVOKED") {
    return { authorized: false, reason: `Provider ${provider} token is expired or revoked` };
  }

  const matchedAsset = connection.discoveredAssets.find(
    (a) => a.category === category && a.isSelected,
  );

  if (!matchedAsset) {
    return { authorized: false, reason: `No selected asset found for category ${category}` };
  }

  if (!matchedAsset.capabilities.includes(capability)) {
    return { authorized: false, reason: `Capability ${capability} not granted for asset ${matchedAsset.name}` };
  }

  return { authorized: true };
}
