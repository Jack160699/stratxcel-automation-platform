/**
 * App-host bootstrap for Workforce capability adapters.
 *
 * Prefer executeWorkforceCapabilityServer() — it calls this automatically.
 * Do not rely on package import side effects.
 *
 * Uses dynamic imports so pure Node ESM tests can import the reset helper
 * without pulling Supabase/Social host modules.
 */
import { bindCapabilityHost } from "@stratxcel/workforce-core";

let bound = false;
let bindPromise: Promise<void> | null = null;

async function bindHosts(): Promise<void> {
  const { createSupabaseServiceClient } = await import("../supabase/service.ts");
  const { persistMissionArtifact } = await import("./mission-artifacts.ts");
  const { ensureSocialCapabilityHostBound } = await import(
    "../social/workforce/capability-host.ts"
  );
  const { ensureAnalyticsCapabilityHostBound } = await import(
    "../reporting/capability-host.ts"
  );
  bindCapabilityHost({
    getServiceClient: () => createSupabaseServiceClient() as never,
    persistMissionArtifact: (input) => persistMissionArtifact(input),
  });
  ensureSocialCapabilityHostBound();
  ensureAnalyticsCapabilityHostBound();
}

/**
 * Idempotent host bind. Safe to call from the canonical server executor.
 * Awaits the first bind; subsequent calls are no-ops.
 */
export async function ensureWorkforceCapabilityHostsBound(): Promise<void> {
  if (bound) return;
  if (!bindPromise) {
    bindPromise = bindHosts().then(() => {
      bound = true;
    });
  }
  await bindPromise;
}

export function resetWorkforceCapabilityHostsBoundForTests(): void {
  bound = false;
  bindPromise = null;
}
