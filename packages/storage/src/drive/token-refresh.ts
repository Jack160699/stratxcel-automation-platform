export interface RefreshedTokens {
  accessToken: string;
  expiresInSeconds: number;
}

export interface TokenRefreshAdapter {
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedTokens>;
}

/**
 * Real HTTP calls to Google's OAuth token endpoint. Inert without a real
 * GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET and a real
 * authorization code or refresh token from a completed consent flow —
 * neither exists in this environment tonight, per "do not attempt OAuth
 * login tonight." Structurally complete and typechecked, not
 * live-verified.
 */
export function createGoogleTokenRefreshAdapter(): TokenRefreshAdapter {
  function getCredentials() {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET are not set");
    return { clientId, clientSecret };
  }

  return {
    async exchangeCodeForTokens(code, redirectUri) {
      const { clientId, clientSecret } = getCredentials();
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) throw new Error(`Google token exchange failed: HTTP ${response.status}`);
      const result = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
      return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresInSeconds: result.expires_in };
    },

    async refreshAccessToken(refreshToken) {
      const { clientId, clientSecret } = getCredentials();
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });
      if (!response.ok) throw new Error(`Google token refresh failed: HTTP ${response.status}`);
      const result = (await response.json()) as { access_token: string; expires_in: number };
      return { accessToken: result.access_token, expiresInSeconds: result.expires_in };
    },
  };
}
