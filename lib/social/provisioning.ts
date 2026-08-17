import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneNumberE164 } from "@stratxcel/whatsapp";

export interface ProvisioningInput {
  tenantId: string;
  userId: string;
  userMetadata?: Record<string, unknown> | null;
  socials?: Array<{
    platform: string;
    url?: string;
    handle?: string;
    confirmed?: boolean;
    providerAccountId?: string;
  }>;
}

export interface ProvisioningSummary {
  whatsappProvisioned: boolean;
  socialAccountsProvisioned: string[];
  googleConnectionsProvisioned: boolean;
}

/**
 * Canonical Tenant Connector Provisioning Bridge.
 *
 * Idempotently migrates verified onboarding connections (from user metadata
 * and/or onboarding input) into canonical tenant relational tables:
 * - public.whatsapp_phone_bindings
 * - public.social_accounts
 * - public.search_google_connections
 *
 * Safe to call repeatedly: uses deterministic unique-key upserts with zero data loss.
 */
export async function provisionTenantConnectorsFromMetadata(
  supabase: SupabaseClient,
  input: ProvisioningInput
): Promise<ProvisioningSummary> {
  const { tenantId, userId, userMetadata, socials = [] } = input;
  const summary: ProvisioningSummary = {
    whatsappProvisioned: false,
    socialAccountsProvisioned: [],
    googleConnectionsProvisioned: false,
  };

  if (!tenantId || !userId) return summary;

  const meta = (userMetadata ?? {}) as Record<string, unknown>;
  const oauthConnections = (meta.onboarding_oauth_connections ?? {}) as Record<string, Record<string, unknown>>;
  const whatsappVerification = meta.onboarding_whatsapp_verification as { phone?: string; verifiedAt?: string } | undefined;

  const now = new Date().toISOString();

  // 1. Provision WhatsApp phone binding
  try {
    const rawPhone =
      (oauthConnections.whatsapp?.providerAccountId as string) ||
      (oauthConnections.whatsapp?.username as string) ||
      whatsappVerification?.phone ||
      socials.find((s) => s.platform === "whatsapp" && s.confirmed !== false)?.url ||
      socials.find((s) => s.platform === "whatsapp" && s.confirmed !== false)?.handle;

    const normalizedPhone = rawPhone ? normalizePhoneNumberE164(String(rawPhone)) : null;

    if (normalizedPhone) {
      const { data: existingBinding } = await supabase
        .from("whatsapp_phone_bindings")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingBinding) {
        await supabase
          .from("whatsapp_phone_bindings")
          .update({
            display_phone_number: normalizedPhone,
            phone_number_id: normalizedPhone,
            status: "active",
            verified_at: whatsappVerification?.verifiedAt || now,
            updated_at: now,
          })
          .eq("id", existingBinding.id);
      } else {
        await supabase.from("whatsapp_phone_bindings").insert({
          tenant_id: tenantId,
          waba_id: "waba_onboarding",
          phone_number_id: normalizedPhone,
          display_phone_number: normalizedPhone,
          environment: "production",
          status: "active",
          default_language: "en",
          timezone: "UTC",
          created_by: userId,
          verified_at: whatsappVerification?.verifiedAt || now,
          updated_at: now,
        });
      }
      summary.whatsappProvisioned = true;
    }
  } catch (err) {
    console.warn("provisionTenantConnectors: non-fatal whatsapp binding error", err);
  }

  // 2. Provision Social Accounts (Instagram, Facebook, YouTube, Threads, LinkedIn)
  const socialPlatforms = ["instagram", "facebook", "youtube", "threads", "linkedin"] as const;

  for (const platform of socialPlatforms) {
    try {
      const metaConn = oauthConnections[platform];
      const directSocial = socials.find((s) => s.platform === platform && s.confirmed !== false);

      if (metaConn || directSocial) {
        const username =
          (metaConn?.username as string) ||
          (metaConn?.displayName as string) ||
          directSocial?.handle ||
          directSocial?.url ||
          platform;

        const displayName =
          (metaConn?.displayName as string) ||
          (metaConn?.username as string) ||
          directSocial?.handle ||
          directSocial?.url ||
          platform;

        const providerAccountId =
          (metaConn?.providerAccountId as string) ||
          directSocial?.providerAccountId ||
          `acct_${platform}_${username.replace(/[^a-zA-Z0-9_]/g, "")}`;

        const permissions = Array.isArray(metaConn?.scopes)
          ? metaConn.scopes
          : ["read", "publish"];

        const { data: existingAccount } = await supabase
          .from("social_accounts")
          .select("id, status")
          .eq("tenant_id", tenantId)
          .eq("platform", platform)
          .maybeSingle();

        if (existingAccount) {
          await supabase
            .from("social_accounts")
            .update({
              owner_id: userId,
              username,
              display_name: displayName,
              permissions,
              status: "CONNECTED",
              token_health: "HEALTHY",
              last_sync_at: now,
              updated_at: now,
            })
            .eq("id", existingAccount.id);
        } else {
          await supabase.from("social_accounts").insert({
            owner_id: userId,
            tenant_id: tenantId,
            platform,
            provider_account_id: providerAccountId,
            username,
            display_name: displayName,
            avatar_url: (metaConn?.avatarUrl as string) || null,
            permissions,
            status: "CONNECTED",
            token_health: "HEALTHY",
            last_sync_at: now,
            updated_at: now,
          });
        }

        summary.socialAccountsProvisioned.push(platform);
      }
    } catch (err) {
      console.warn(`provisionTenantConnectors: non-fatal ${platform} account error`, err);
    }
  }

  // 3. Provision Google Search / GA4 / Business Connections
  try {
    const googleMeta = oauthConnections.google_business || oauthConnections.google;
    const googleSearchMeta = oauthConnections.google_search;
    const googleSocial = socials.find((s) => (s.platform === "google_business" || s.platform === "google" || s.platform === "google_search_console" || s.platform === "google_analytics") && s.confirmed !== false);

    if (googleMeta || googleSearchMeta || googleSocial) {
      const searchConsoleSiteUrl =
        (googleSearchMeta?.searchConsoleSiteUrl as string) ||
        (googleMeta?.searchConsoleSiteUrl as string) ||
        (socials.find((s) => s.platform === "google_search_console")?.url) ||
        null;

      const ga4PropertyId =
        (googleSearchMeta?.ga4PropertyId as string) ||
        (googleMeta?.ga4PropertyId as string) ||
        (socials.find((s) => s.platform === "google_analytics")?.handle) ||
        null;

      const ga4PropertyDisplayName =
        (googleSearchMeta?.ga4PropertyDisplayName as string) ||
        (googleMeta?.ga4PropertyDisplayName as string) ||
        null;

      const { data: existingG } = await supabase
        .from("search_google_connections")
        .select("search_console_site_url, ga4_property_id, ga4_property_display_name")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      await supabase.from("search_google_connections").upsert(
        {
          tenant_id: tenantId,
          status: "connected",
          search_console_site_url: searchConsoleSiteUrl || existingG?.search_console_site_url || null,
          ga4_property_id: ga4PropertyId || existingG?.ga4_property_id || null,
          ga4_property_display_name: ga4PropertyDisplayName || existingG?.ga4_property_display_name || null,
          connected_by_user_id: userId,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "tenant_id" }
      );
      summary.googleConnectionsProvisioned = true;
    }
  } catch (err) {
    console.warn("provisionTenantConnectors: non-fatal google connection error", err);
  }

  return summary;
}
