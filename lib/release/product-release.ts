/**
 * Canonical Stratxcel product release classification.
 *
 * Release status is NEVER inferred from route existence, git branch,
 * feature flags, table presence, or "code is on main". Every product
 * surface that participates in navigation must declare an explicit
 * ProductRelease. Unknown / missing release values fail closed.
 */

export type ProductRelease = "v1" | "v2";

export const PRODUCT_RELEASES: readonly ProductRelease[] = ["v1", "v2"] as const;

export function isProductRelease(value: unknown): value is ProductRelease {
  return value === "v1" || value === "v2";
}

/** Fail closed: only an explicit known release is accepted. */
export function normalizeProductRelease(value: unknown): ProductRelease | null {
  return isProductRelease(value) ? value : null;
}

/**
 * Whether a surface with the given release metadata is visible for the
 * current visibility set. Unknown release → never visible.
 */
export function isReleaseVisible(
  release: unknown,
  opts: { allowV2: boolean }
): boolean {
  const normalized = normalizeProductRelease(release);
  if (!normalized) return false;
  if (normalized === "v1") return true;
  return opts.allowV2;
}
