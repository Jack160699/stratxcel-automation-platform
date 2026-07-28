export function accessTokenNeedsRefresh(expiresAt: string | null, now = Date.now(), skewMs = 60_000): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now + skewMs;
}
