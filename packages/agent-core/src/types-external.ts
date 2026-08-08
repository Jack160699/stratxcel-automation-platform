/**
 * Small local mirror of external type shapes this package depends on
 * conceptually but cannot import directly (they live in the Next.js app's
 * lib/, not in a workspace package — see lib/tenants/types.ts). Keeping a
 * narrow local copy avoids agent-core depending on app-side code, matching
 * the existing precedent of each package owning its own db.ts/flags.ts
 * rather than sharing one.
 */
export type TenantRole = "owner" | "admin" | "operator" | "viewer";
