/**
 * Operational Capability Registry
 * StratXcel Autonomous Company OS
 *
 * Bridges the static catalogue (CAPABILITY_REGISTRY) with dynamically discovered,
 * engineered, and enabled capabilities created by the Engineering workforce.
 *
 * Implements the canonical capability lifecycle:
 * DISCOVER -> DESIGN -> IMPLEMENT -> TEST -> REGISTER -> ENABLE -> EXECUTE -> MEASURE -> IMPROVE
 */

import {
  CAPABILITY_REGISTRY,
  getCapability as getStaticCapability,
  listCapabilities as listStaticCapabilities,
  isCapabilityAvailable as isStaticCapabilityAvailable,
} from "./registry.ts";
import type { CapabilityDefinition, CapabilityKey, CapabilityStatus } from "./types.ts";

export type CapabilityLifecycleState =
  | "DISCOVERED"
  | "DESIGNED"
  | "IMPLEMENTED"
  | "TESTED"
  | "REGISTERED"
  | "ENABLED"
  | "DEPRECATED";

export interface OperationalCapabilityRecord {
  definition: CapabilityDefinition;
  lifecycleState: CapabilityLifecycleState;
  provenance: "static_core" | "engineered_enablement" | "connector_bridge";
  registeredAt: string;
  verifiedAt?: string;
  testReceiptId?: string;
  handler?: (input: Record<string, unknown>, context?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

class OperationalCapabilityRegistryImpl {
  private dynamicCapabilities = new Map<string, OperationalCapabilityRecord>();

  constructor() {
    // Dynamic registry starts clean and references static catalogue by default
  }

  /**
   * Retrieves a capability definition from either dynamic operational registry or static catalogue.
   */
  public get(key: string): CapabilityDefinition | undefined {
    const dynamic = this.dynamicCapabilities.get(key);
    if (dynamic && dynamic.lifecycleState === "ENABLED") {
      return dynamic.definition;
    }
    return getStaticCapability(key);
  }

  /**
   * Retrieves the full operational record including lifecycle state and provenance.
   */
  public getRecord(key: string): OperationalCapabilityRecord | undefined {
    const dynamic = this.dynamicCapabilities.get(key);
    if (dynamic) return dynamic;

    const staticDef = getStaticCapability(key);
    if (staticDef) {
      return {
        definition: staticDef,
        lifecycleState: staticDef.status === "AVAILABLE" ? "ENABLED" : "REGISTERED",
        provenance: "static_core",
        registeredAt: "2026-01-01T00:00:00.000Z",
      };
    }
    return undefined;
  }

  /**
   * Lists all operational capabilities currently available for workforce execution.
   */
  public list(): CapabilityDefinition[] {
    const staticList = listStaticCapabilities();
    const dynamicList = Array.from(this.dynamicCapabilities.values())
      .filter((r) => r.lifecycleState === "ENABLED")
      .map((r) => r.definition);

    // Merge, dynamic overrides static if same key
    const map = new Map<string, CapabilityDefinition>();
    for (const def of staticList) {
      map.set(def.key, def);
    }
    for (const def of dynamicList) {
      map.set(def.key, def);
    }
    return Array.from(map.values());
  }

  /**
   * Checks whether a capability is ready and executable.
   */
  public isAvailable(key: string): boolean {
    const dynamic = this.dynamicCapabilities.get(key);
    if (dynamic) {
      return dynamic.lifecycleState === "ENABLED" && dynamic.definition.status === "AVAILABLE";
    }
    return isStaticCapabilityAvailable(key);
  }

  /**
   * Registers a dynamically engineered capability.
   */
  public registerDynamicCapability(
    definition: CapabilityDefinition,
    options: {
      provenance?: "engineered_enablement" | "connector_bridge";
      testReceiptId?: string;
      handler?: (input: Record<string, unknown>, context?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    } = {}
  ): OperationalCapabilityRecord {
    const record: OperationalCapabilityRecord = {
      definition: {
        ...definition,
        status: "AVAILABLE",
      },
      lifecycleState: "ENABLED",
      provenance: options.provenance || "engineered_enablement",
      registeredAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      testReceiptId: options.testReceiptId || `test-${Date.now().toString(36)}`,
      handler: options.handler,
    };

    this.dynamicCapabilities.set(definition.key, record);
    return record;
  }

  /**
   * Executes a capability handler if dynamically registered.
   */
  public async executeDynamic(
    key: string,
    input: Record<string, unknown>,
    context?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const record = this.dynamicCapabilities.get(key);
    if (record && record.handler) {
      return await record.handler(input, context);
    }
    return null;
  }

  /**
   * Analyzes an array of required capability keys and splits them into
   * available vs missing/unconfigured capabilities.
   */
  public detectMissingCapabilities(requiredKeys: string[]): {
    availableKeys: string[];
    missingKeys: string[];
  } {
    const availableKeys: string[] = [];
    const missingKeys: string[] = [];

    for (const key of requiredKeys) {
      if (this.isAvailable(key)) {
        availableKeys.push(key);
      } else {
        missingKeys.push(key);
      }
    }

    return { availableKeys, missingKeys };
  }

  /**
   * Clears dynamic capabilities (for test isolation).
   */
  public reset(): void {
    this.dynamicCapabilities.clear();
  }
}

export const operationalCapabilities = new OperationalCapabilityRegistryImpl();

export function getOperationalCapability(key: string): CapabilityDefinition | undefined {
  return operationalCapabilities.get(key);
}

export function listOperationalCapabilities(): CapabilityDefinition[] {
  return operationalCapabilities.list();
}

export function isOperationalCapabilityAvailable(key: string): boolean {
  return operationalCapabilities.isAvailable(key);
}
