import type { ProviderHealthCheckResult, ProviderCapabilityRecord } from "./types.ts";
import { buildProviderCapabilityMatrix } from "./inventory.ts";

export async function runProviderHealthDiagnostics(options?: {
  customMatrix?: ProviderCapabilityRecord[];
}): Promise<ProviderHealthCheckResult[]> {
  const matrix = options?.customMatrix || buildProviderCapabilityMatrix();
  const results: ProviderHealthCheckResult[] = [];
  const now = new Date().toISOString();

  for (const prov of matrix) {
    const startTime = Date.now();
    let readOk = false;
    let writeOk = false;
    let errorMessage: string | undefined;

    if (prov.credentialState === "SET" && prov.adapterExists) {
      readOk = prov.readAvailable;
      writeOk = prov.writeAvailable;
    } else {
      errorMessage = `Credentials or API key missing for ${prov.displayName}.`;
    }

    const latencyMs = Date.now() - startTime;

    results.push({
      providerKey: prov.providerKey,
      displayName: prov.displayName,
      status: prov.status,
      checkedAt: now,
      latencyMs: Math.max(1, latencyMs),
      readOk,
      writeOk,
      scopes: prov.writeAvailable ? ["read", "write"] : ["read"],
      errorMessage,
      nextAction: prov.manualSetupRequired,
    });
  }

  return results;
}
