/**
 * Test-only simulated / mock capability providers.
 * Must NOT be imported from production bootstrap.
 */
import type { CapabilityKey } from "../../capabilities/types.ts";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteInput,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../../providers/types.ts";

export type MockCapabilityProvider = CapabilityProvider;

/**
 * Creates an IMPLEMENTED provider that returns ok:true with simulated:true.
 * For unit/integration tests that need a fake success path only.
 * Production requestCapability REJECTS receipts with simulated:true.
 */
export function createSimulatedSuccessProvider(args: {
  key: string;
  capabilityKeys: readonly CapabilityKey[];
  receiptKind?: string;
}): MockCapabilityProvider {
  return {
    key: args.key,
    capabilityKeys: args.capabilityKeys,
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
    }),
    execute: async (input: ProviderExecuteInput): Promise<ProviderExecuteResult> => ({
      ok: true,
      providerKey: args.key,
      providerReference: `${args.key}:${input.requestId}`,
      outputArtifactIds: [`artifact:simulated:${input.requestId}`],
      usage: unknownCostUsage({ requests: 1 }),
      receipt: {
        kind: args.receiptKind ?? "simulated_receipt",
        simulated: true,
      },
    }),
  };
}

/**
 * Test-only success provider WITHOUT simulated:true.
 * Safe for proving the production requestCapability success path under injection.
 */
export function createTestSuccessProvider(args: {
  key: string;
  capabilityKeys: readonly CapabilityKey[];
  receiptKind?: string;
}): MockCapabilityProvider {
  return {
    key: args.key,
    capabilityKeys: args.capabilityKeys,
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
    }),
    execute: async (input: ProviderExecuteInput): Promise<ProviderExecuteResult> => ({
      ok: true,
      providerKey: args.key,
      providerReference: `${args.key}:${input.requestId}`,
      outputArtifactIds: [`artifact:test:${input.requestId}`],
      usage: unknownCostUsage({ requests: 1 }),
      receipt: {
        kind: args.receiptKind ?? "test_receipt",
        testOnly: true,
      },
    }),
  };
}
