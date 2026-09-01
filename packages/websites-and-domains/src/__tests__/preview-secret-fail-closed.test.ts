// Run with: node --experimental-strip-types packages/websites-and-domains/src/__tests__/preview-secret-fail-closed.test.ts
import assert from "node:assert/strict";
import { resolvePreviewSecretKey } from "../preview/preview-manager.ts";

/**
 * Regression for a real security anti-pattern found live 2026-09-02
 * (convergence-loop mission, section 25 security pass): PreviewManager
 * used to fall back to a hardcoded, source-visible constant
 * ("stratxcel_preview_hmac_secret_2026") whenever PREVIEW_SECRET_KEY
 * wasn't configured -- confirmed harmless only because no real app/ route
 * currently calls this class, not because the pattern itself was safe.
 * Fixed to mirror config/production-gate.ts's own established fail-closed
 * discipline exactly: hard failure in production if genuinely
 * unconfigured; a real, unpredictable, non-constant secret everywhere else.
 */
function run() {
  // Explicit secret always wins, regardless of environment.
  assert.equal(resolvePreviewSecretKey("explicit-secret", { NODE_ENV: "production" }), "explicit-secret");

  // A real configured env var is used as-is.
  assert.equal(
    resolvePreviewSecretKey(undefined, { NODE_ENV: "production", PREVIEW_SECRET_KEY: "real-configured-secret" }),
    "real-configured-secret"
  );

  // The real defect this regresses: production with NEITHER an explicit
  // secret NOR PREVIEW_SECRET_KEY configured must fail loudly, never fall
  // back to a known, predictable, source-visible string.
  assert.throws(
    () => resolvePreviewSecretKey(undefined, { NODE_ENV: "production" }),
    /PREVIEW_SECRET_KEY is required in production/,
    "production with no configured secret must throw, not silently sign with a guessable default"
  );

  // Non-production with no configured secret: permissive (matches every
  // other fail-closed gate in this package -- errors in production,
  // warnings/defaults elsewhere), but the fallback itself must be real and
  // unpredictable, never the literal string this bug used to hardcode.
  const devSecret1 = resolvePreviewSecretKey(undefined, { NODE_ENV: "development" });
  const devSecret2 = resolvePreviewSecretKey(undefined, { NODE_ENV: "development" });
  assert.notEqual(devSecret1, "stratxcel_preview_hmac_secret_2026", "must never fall back to the old hardcoded constant");
  assert.notEqual(devSecret1, devSecret2, "each unconfigured call must generate a fresh, unpredictable secret, not reuse one fixed value");
  assert.equal(devSecret1.length, 64, "must be a real, high-entropy 32-byte hex secret, not a short/guessable placeholder");

  console.log("preview-secret-fail-closed.test.ts (@stratxcel/websites-and-domains): ALL PASS");
}

run();
