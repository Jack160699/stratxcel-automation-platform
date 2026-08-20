/**
 * Hosting Provider Adapter — abstraction for website deployment providers.
 * The first (and currently only) implementation is Vercel, extending the
 * existing vercel-domains.ts. The interface is provider-agnostic so a
 * future swap to Cloudflare Pages / AWS Amplify / Netlify is a new
 * adapter file, not a rewrite of the deployment pipeline.
 */

export interface HostingDeploymentResult {
  success: boolean;
  deploymentId: string;
  deploymentUrl: string;
  provider: string;
  status: "building" | "ready" | "error" | "queued";
  error?: string;
}

export interface HostingDomainResult {
  success: boolean;
  domain: string;
  verified: boolean;
  sslActive: boolean;
  configured: boolean;
  verificationRecords?: Array<{ type: string; name: string; value: string }>;
  error?: string;
}

export interface HostingProjectResult {
  success: boolean;
  projectId: string;
  projectUrl: string;
  provider: string;
  error?: string;
}

export interface HostingProviderAdapter {
  readonly providerName: string;
  readonly mode: "disabled" | "sandbox" | "live";

  /** Deploy a build to the hosting provider. */
  deploy(input: {
    projectId: string;
    siteContent: Record<string, unknown>;
    metadata?: Record<string, string>;
  }): Promise<HostingDeploymentResult>;

  /** Get the status of a deployment. */
  getDeploymentStatus(deploymentId: string): Promise<HostingDeploymentResult>;

  /** Attach a custom domain to the hosting project. */
  assignCustomDomain(projectId: string, domain: string): Promise<HostingDomainResult>;

  /** Get the current status of a custom domain attachment. */
  getDomainStatus(projectId: string, domain: string): Promise<HostingDomainResult>;

  /** Get the deployment URL for a project. */
  getDeploymentUrl(projectId: string): Promise<string>;

  /** Trigger a redeployment. */
  redeploy(projectId: string): Promise<HostingDeploymentResult>;

  /** Suspend/disable a project deployment. */
  suspend(projectId: string): Promise<{ success: boolean; error?: string }>;
}

export class HostingProviderDisabledError extends Error {
  constructor() {
    super("Hosting provider is disabled — set HOSTING_PROVIDER_MODE to enable deployments");
    this.name = "HostingProviderDisabledError";
  }
}
