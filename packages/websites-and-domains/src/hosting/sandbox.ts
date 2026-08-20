/**
 * Sandbox Hosting Provider — no real deployment, no real domain attachment.
 * Returns deterministic fake results for testing the deployment pipeline.
 */

import type {
  HostingProviderAdapter,
  HostingDeploymentResult,
  HostingDomainResult,
} from "./adapter.ts";

export class SandboxHostingProvider implements HostingProviderAdapter {
  readonly providerName = "sandbox";
  readonly mode = "sandbox" as const;

  async deploy(input: {
    projectId: string;
    siteContent: Record<string, unknown>;
  }): Promise<HostingDeploymentResult> {
    return {
      success: true,
      deploymentId: `sb_deploy_${Date.now()}`,
      deploymentUrl: `https://${input.projectId}.sandbox.stratxcel.site`,
      provider: this.providerName,
      status: "ready",
    };
  }

  async getDeploymentStatus(deploymentId: string): Promise<HostingDeploymentResult> {
    return {
      success: true,
      deploymentId,
      deploymentUrl: "https://sandbox.stratxcel.site",
      provider: this.providerName,
      status: "ready",
    };
  }

  async assignCustomDomain(_projectId: string, domain: string): Promise<HostingDomainResult> {
    return {
      success: true,
      domain,
      verified: true,
      sslActive: true,
      configured: true,
    };
  }

  async getDomainStatus(_projectId: string, domain: string): Promise<HostingDomainResult> {
    return {
      success: true,
      domain,
      verified: true,
      sslActive: true,
      configured: true,
    };
  }

  async getDeploymentUrl(projectId: string): Promise<string> {
    return `https://${projectId}.sandbox.stratxcel.site`;
  }

  async redeploy(projectId: string): Promise<HostingDeploymentResult> {
    return this.deploy({ projectId, siteContent: {} });
  }

  async suspend(_projectId: string): Promise<{ success: boolean }> {
    return { success: true };
  }
}
