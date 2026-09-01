/**
 * Tenant-Safe Version-Aware Preview URL Manager
 *
 * Generates stable preview URLs with HMAC-SHA256 signing, expiration,
 * version targeting, strict tenant isolation, and search engine noindex enforcement.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { resolveAppEnvironment } from "../config/production-gate.ts";
import type {
  PreviewTokenPayload,
  PreviewResolutionResult,
  PreviewMetaHeaders,
} from "./types.ts";

/**
 * Resolves the real HMAC signing secret -- never a hardcoded, source-visible
 * constant. Found 2026-09-02 (convergence-loop mission, section 25 security
 * pass): this class previously fell back to the literal string
 * "stratxcel_preview_hmac_secret_2026" whenever PREVIEW_SECRET_KEY wasn't
 * set -- a real anti-pattern (per the master build brief's own rule 3, "do
 * not expose secret values in code") that happened to be harmless only
 * because grepping the whole repo confirms zero real app/ routes currently
 * call this class (only its own smoke-test and unit test do). Fixed before
 * anything wires it up, not after. Mirrors config/production-gate.ts's
 * existing, already-established fail-closed pattern exactly rather than
 * inventing a new one: hard failure if production and genuinely
 * unconfigured; a real, unpredictable, process-lifetime-scoped random
 * secret (never the same value twice, never guessable from source) in
 * every other environment, so tests keep working without needing a real
 * secret configured.
 */
export function resolvePreviewSecretKey(explicit?: string, envObj: Record<string, string | undefined> = process.env): string {
  if (explicit) return explicit;
  const envKey = envObj.PREVIEW_SECRET_KEY;
  if (envKey) return envKey;
  if (resolveAppEnvironment(envObj) === "production") {
    throw new Error("PREVIEW_SECRET_KEY is required in production -- preview URL signing must never fall back to a predictable default.");
  }
  return randomBytes(32).toString("hex");
}

export class PreviewManager {
  private secretKey: string;
  private defaultBaseUrl: string;
  private defaultTtlSeconds: number;

  constructor(options?: {
    secretKey?: string;
    baseUrl?: string;
    defaultTtlSeconds?: number;
  }) {
    this.secretKey = resolvePreviewSecretKey(options?.secretKey);
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
