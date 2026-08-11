/**
 * App-host bootstrap for Workforce capability adapters.
 *
 * Call once on server capability execution paths (mission runners, workers,
 * admin diagnostics). Does not run on import of pure Social workforce helpers.
 */
import { bindCapabilityHost } from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../supabase/service";
import { ensureSocialCapabilityHostBound } from "../social/workforce/capability-host";
import { ensureAnalyticsCapabilityHostBound } from "../reporting/capability-host";

let bound = false;

export function ensureWorkforceCapabilityHostsBound(): void {
  if (bound) return;
  bound = true;
  bindCapabilityHost({
    getServiceClient: () => createSupabaseServiceClient() as never,
  });
  ensureSocialCapabilityHostBound();
  ensureAnalyticsCapabilityHostBound();
}
