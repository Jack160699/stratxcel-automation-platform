/**
 * Tenant-Safe Version-Aware Preview URL Manager
 *
 * Generates stable preview URLs with HMAC-SHA256 signing, expiration,
 * version targeting, strict tenant isolation, and search engine noindex enforcement.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PreviewTokenPayload,
  PreviewResolutionResult,
  PreviewMetaHeaders,
} from "./types.ts";

export class PreviewManager {
  private secretKey: string;
  private defaultBaseUrl: string;
  private defaultTtlSeconds: number;

  constructor(options?: {
    secretKey?: string;
    baseUrl?: string;
    defaultTtlSeconds?: number;
  }) {
    this.secretKey = options?.secretKey || process.env.PREVIEW_SECRET_KEY || "stratxcel_preview_hmac_secret_2026";
    this.defaultBaseUrl = options?.baseUrl || "https://preview.stratxcel.in";
    this.defaultTtlSeconds = options?.defaultTtlSeconds || 60 * 60 * 24 * 7; // 7 days
  }

  /**
   * Generates a signed preview token for a project version.
   */
  public generateSignedToken(params: {
    projectId: string;
    tenantId: string;
    version: number;
    ttlSeconds?: number;
  }): string {
    const { projectId, tenantId, version, ttlSeconds } = params;
    const expiresAt = Math.floor(Date.now() / 1000) + (ttlSeconds || this.defaultTtlSeconds);

    const payload: PreviewTokenPayload = {
      projectId,
      tenantId,
      version,
      expiresAt,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secretKey)
      .update(payloadB64)
      .digest("base64url");

    return `${payloadB64}.${signature}`;
  }

  /**
   * Generates the canonical customer preview URL.
   */
  public getPreviewUrl(params: {
    projectId: string;
    tenantId: string;
    version: number;
    ttlSeconds?: number;
    signed?: boolean;
  }): string {
    const { projectId, version, signed = false } = params;

    if (signed) {
      const token = this.generateSignedToken(params);
      return `${this.defaultBaseUrl}/project/${encodeURIComponent(projectId)}?version=${version}&token=${token}`;
    }

    return `${this.defaultBaseUrl}/project/${encodeURIComponent(projectId)}?version=${version}`;
  }

  /**
   * Validates a signed preview token.
   */
  public verifySignedToken(token: string): PreviewResolutionResult {
    try {
      const parts = token.split(".");
      if (parts.length !== 2) {
        return {
          allowed: false,
          projectId: "",
          tenantId: "",
          version: 0,
          error: "Invalid token format",
        };
      }

      const [payloadB64, signature] = parts;
      const expectedSig = createHmac("sha256", this.secretKey)
        .update(payloadB64)
        .digest("base64url");

      const sigBuffer = Buffer.from(signature);
      const expBuffer = Buffer.from(expectedSig);

      if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
        return {
          allowed: false,
          projectId: "",
          tenantId: "",
          version: 0,
          error: "Invalid token signature",
        };
      }

      const payload: PreviewTokenPayload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf-8")
      );

      const now = Math.floor(Date.now() / 1000);
      if (payload.expiresAt < now) {
        return {
          allowed: false,
          projectId: payload.projectId,
          tenantId: payload.tenantId,
          version: payload.version,
          isExpired: true,
          error: "Preview token expired",
        };
      }

      return {
        allowed: true,
        projectId: payload.projectId,
        tenantId: payload.tenantId,
        version: payload.version,
      };
    } catch {
      return {
        allowed: false,
        projectId: "",
        tenantId: "",
        version: 0,
        error: "Failed to decode preview token",
      };
    }
  }

  /**
   * Returns strict noindex and security headers for preview responses.
   */
  public getPreviewHeaders(): PreviewMetaHeaders {
    return {
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self' https://preview.stratxcel.in http://localhost:*",
    };
  }
}

export const previewManager = new PreviewManager();
