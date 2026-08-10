/**
 * Pure release-mode helpers (no next/headers) — importable from Node tests.
 */

export const RELEASE_MODE_COOKIE = "sx_release_mode";

export type ReleaseMode = "stable" | "beta";

export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function isReleaseMode(value: unknown): value is ReleaseMode {
  return value === "stable" || value === "beta";
}

export function parseReleaseMode(value: string | undefined | null): ReleaseMode {
  return value === "beta" ? "beta" : "stable";
}
