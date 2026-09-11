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
  function getCandidateCredentials(): Array<{ clientId: string; clientSecret: string }> {
    const list: Array<{ clientId: string; clientSecret: string }> = [];

    const primaryId =
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      process.env.GOOGLE_DRIVE_CLIENT_ID ||
      process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID;
    const primarySecret =
      process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
      process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET;

    if (primaryId && primarySecret) {
      list.push({ clientId: primaryId, clientSecret: primarySecret });
    }

    const searchId = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
    const searchSecret = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;
    if (searchId && searchSecret && searchId !== primaryId) {
      list.push({ clientId: searchId, clientSecret: searchSecret });
    }

    const fallbackId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (fallbackId && primarySecret && fallbackId !== primaryId && fallbackId !== searchId) {
      list.push({ clientId: fallbackId, clientSecret: primarySecret });
    }

    if (list.length === 0) {
      throw new Error("No Google OAuth client credentials configured in environment");
    }
    return list;
  }

  return {
    async exchangeCodeForTokens(code, redirectUri) {
      const candidates = getCandidateCredentials();
      let lastError: Error | null = null;

      for (const { clientId, clientSecret } of candidates) {
        try {
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
          if (response.ok) {
            const result = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
            return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresInSeconds: result.expires_in };
          }
          const errText = await response.text();
          lastError = new Error(`Google token exchange failed: HTTP ${response.status}: ${errText}`);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      throw lastError || new Error("Google token exchange failed on all candidate credentials");
    },

    async refreshAccessToken(refreshToken) {
      const candidates = getCandidateCredentials();
      let lastError: Error | null = null;

      for (const { clientId, clientSecret } of candidates) {
        try {
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
          if (response.ok) {
            const result = (await response.json()) as { access_token: string; expires_in: number };
            return { accessToken: result.access_token, expiresInSeconds: result.expires_in };
          }
          const errText = await response.text();
          lastError = new Error(`Google token refresh failed (HTTP ${response.status}): ${errText}`);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      throw lastError || new Error("Google token refresh failed on all candidate credentials");
    },
  };
}

