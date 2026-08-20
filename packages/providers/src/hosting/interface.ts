/**
 * Hosting & Deployment Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface DeployInput {
  tenantId: string;
  projectId: string;
  files: Record<string, string>;
  production?: boolean;
}

export interface DeploymentResult {
  deploymentId: string;
  url: string;
  status: "BUILDING" | "READY" | "ERROR";
  provider: string;
  createdAt: string;
}

export interface AttachDomainInput {
  domain: string;
  projectId: string;
}

export interface HostingProvider {
  name: string;
  deploy: (input: DeployInput) => Promise<DeploymentResult>;
  attachDomain: (input: AttachDomainInput) => Promise<{ success: boolean; verified: boolean }>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockHostingProvider implements HostingProvider {
  public name = "mock_vercel";

  public async deploy(input: DeployInput): Promise<DeploymentResult> {
    return {
      deploymentId: `dpl_${Date.now()}`,
      url: `https://${input.projectId}-preview.stratxcel.com`,
      status: "READY",
      provider: this.name,
      createdAt: new Date().toISOString(),
    };
  }

  public async attachDomain(input: AttachDomainInput): Promise<{ success: boolean; verified: boolean }> {
    return { success: true, verified: true };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "hosting",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockHostingProvider = new MockHostingProvider();
