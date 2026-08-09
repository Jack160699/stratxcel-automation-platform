import type { SearchDb } from "../repository.ts";
import type { SecretVault } from "@stratxcel/byok";
import { getGoogleConnection, upsertGoogleConnectionStatus } from "./repository.ts";
import { createGoogleSearchTokenAdapter } from "./oauth.ts";

export class GoogleNotConnectedError extends Error {
  constructor(reason = "No Google connection for this tenant.") {
    super(reason);
    this.name = "GoogleNotConnectedError";
  }
}

export class GooglePermissionLostError extends Error {
  constructor(reason = "Google access was revoked or the refresh token is no longer valid.") {
    super(reason);
    this.name = "GooglePermissionLostError";
  }
}

/**
 * Resolves a live access token for a tenant's Google connection at call
 * time — never cached in this module, so a revoked/expired refresh token is
 * detected on the very next read rather than after some stale cache
 * expires. The refresh token itself never leaves this function: only the
 * short-lived access token is returned to the caller.
 */
export async function getLiveGoogleAccessToken(db: SearchDb, vault: SecretVault, tenantId: string): Promise<string> {
  const connection = await getGoogleConnection(db, tenantId);
  if (!connection || connection.status !== "connected" || !connection.encrypted_refresh_token_ref) {
    throw new GoogleNotConnectedError();
  }

  const refreshToken = await vault.retrieve(connection.encrypted_refresh_token_ref);
  if (!refreshToken) throw new GooglePermissionLostError("Stored Google credential could not be read — reconnect required.");

  try {
    const tokenAdapter = createGoogleSearchTokenAdapter();
    const refreshed = await tokenAdapter.refreshAccessToken(refreshToken);
    return refreshed.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google token refresh failed";
    // A refresh failure almost always means the grant was revoked on Google's
    // side (or the stored refresh token is stale/invalid) — mark the
    // connection accordingly so the UI can prompt reconnection truthfully,
    // rather than silently retrying with a token that will never work.
    await upsertGoogleConnectionStatus(db, { tenantId, status: "error", lastError: message.slice(0, 500) });
    throw new GooglePermissionLostError(message);
  }
}
