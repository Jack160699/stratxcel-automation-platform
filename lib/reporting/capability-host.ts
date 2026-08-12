/**
 * Analytics capability host — tenant-scoped, real GA4 reads through the
 * canonical Search/Google provider. OAuth tokens never leave that provider.
 */
import {
  bindCapabilityHost,
  type AnalyticsReadHostInput,
  type AnalyticsReadHostResult,
} from "@stratxcel/workforce-core";
import { createDevEncryptedVault } from "@stratxcel/byok";
import {
  createGoogleAnalyticsProvider,
  ProviderUnavailableError,
} from "@stratxcel/search-discovery";
import { createSupabaseServiceClient } from "../supabase/service.ts";

async function analyticsRead(input: AnalyticsReadHostInput): Promise<AnalyticsReadHostResult> {
  try {
    const service = createSupabaseServiceClient();
    const requested = new Set(
      (input.sources?.length ? input.sources : ["ga4"]).map((source) => source.toLowerCase()),
    );
    if (![...requested].every((source) => source === "ga4" || source === "google_analytics")) {
      return {
        ok: false,
        errorCategory: "INVALID_INPUT",
        errorMessage: "analytics.read currently supports only ga4/google_analytics",
      };
    }

    const provider = createGoogleAnalyticsProvider({
      db: service,
      vault: createDevEncryptedVault(service),
      tenantId: input.tenantId,
    });
    const connection = await provider.connection();
    if (connection.state !== "connected") {
      return {
        ok: false,
        errorCategory: "AUTH_CONFIGURATION",
        errorMessage: `ga4_${connection.state}:${connection.reason ?? "not_ready"}`.slice(0, 500),
      };
    }

    const snapshot = await provider.readOutcomes(input.tenantId, "");
    return {
      ok: true,
      sources: [
        {
          source: "ga4",
          status: "connected",
          reason: null,
          metrics: {
            periodStart: snapshot.periodStart,
            periodEnd: snapshot.periodEnd,
            landingPages: snapshot.landingPages,
          },
        },
      ],
    };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return {
        ok: false,
        errorCategory:
          err.state === "not_connected" ||
          err.state === "configuration_required" ||
          err.state === "permission_required"
            ? "AUTH_CONFIGURATION"
            : "PROVIDER_FAILURE",
        errorMessage: err.message.slice(0, 500),
      };
    }
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
