/**
 * Preview / Demo URL System Types & Security Contracts
 */

export interface PreviewTokenPayload {
  projectId: string;
  tenantId: string;
  version: number;
  expiresAt: number; // Unix timestamp in seconds
}

export interface PreviewUrlConfig {
  baseUrl?: string;
  defaultTtlSeconds?: number;
}

export interface PreviewResolutionResult {
  allowed: boolean;
  projectId: string;
  tenantId: string;
  version: number;
  isExpired?: boolean;
  error?: string;
}

export interface PreviewMetaHeaders {
  "X-Robots-Tag": string;
  "Cache-Control": string;
  "X-Frame-Options"?: string;
  "Content-Security-Policy"?: string;
}
