/**
 * Analytics capability host — tenant-scoped reporting status, no OAuth tokens.
 */
import {
  bindCapabilityHost,
  type AnalyticsReadHostInput,
  type AnalyticsReadHostResult,
  type AnalyticsSourceSnapshot,
} from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../supabase/service.ts";
import {
  deriveGoogleAnalyticsStatus,
  deriveSearchConsoleStatus,
  deriveSocialProviderStatus,
  deriveVercelAnalyticsStatus,
  selectLiveAccount,
  type ReportingProviderId,
  type SocialAccountRow,
} from "./status";

const SOCIAL_PROVIDERS: ReportingProviderId[] = [
  "youtube",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
];

async function analyticsRead(input: AnalyticsReadHostInput): Promise<AnalyticsReadHostResult> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("social_accounts")
      .select("platform, status, token_health, permissions, last_sync_at, updated_at, tenant_id")
      .eq("tenant_id", input.tenantId);
    if (error) {
      return {
        ok: false,
        errorCategory: "PROVIDER_FAILURE",
        errorMessage: error.message.slice(0, 500),
      };
    }

    const rows = ((data ?? []) as Array<SocialAccountRow & { tenant_id?: string }>).filter(
      (r) => r.tenant_id === input.tenantId,
    );
    const wanted = input.sources?.length
      ? new Set(input.sources.map((s: string) => s.toLowerCase()))
      : null;

    const sources: AnalyticsSourceSnapshot[] = [];
    for (const provider of SOCIAL_PROVIDERS) {
      if (wanted && !wanted.has(provider)) continue;
      const account = selectLiveAccount(rows, provider);
      const status = deriveSocialProviderStatus(provider, account);
      sources.push({
        source: provider,
        status: status.status,
        reason: status.reason,
        metrics: null,
      });
    }

    for (const status of [
      deriveGoogleAnalyticsStatus(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      deriveSearchConsoleStatus(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION),
      deriveVercelAnalyticsStatus(),
    ]) {
      if (wanted && !wanted.has(status.provider)) continue;
      sources.push({
        source: status.provider,
        status: status.status,
        reason: status.reason,
        metrics: null,
      });
    }

    return { ok: true, sources };
  } catch (err) {
    return {
      ok: false,
      errorCategory: "PROVIDER_FAILURE",
      errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    };
  }
}

let bound = false;

export function ensureAnalyticsCapabilityHostBound(): void {
  if (bound) return;
  bound = true;
  bindCapabilityHost({ analyticsRead });
}
