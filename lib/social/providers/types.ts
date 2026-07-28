export type SocialProviderName = "instagram" | "facebook" | "threads" | "linkedin" | "youtube";
export type PublishPrivacyStatus = "private" | "unlisted" | "public";

export interface OAuthExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  externalAccountId: string;
  displayName?: string;
  username?: string;
  profilePictureUrl?: string;
  scopes: string[];
}

export interface PublishInput {
  accessToken: string;
  externalAccountId: string;
  caption: string;
  mediaUrls: string[];
  /**
   * Provider-supported visibility for media publishing. YouTube defaults to
   * private when this is omitted so a newly added workflow cannot
   * accidentally publish a public video.
   */
  privacyStatus?: PublishPrivacyStatus;
}

export interface PublishResult {
  externalPostId: string;
  permalink?: string;
  raw: unknown;
}

export interface InsightsResult {
  metrics: Record<string, number | string>;
}

/**
 * Shared contract every Meta destination implements. Keeps platform-specific
 * conditionals inside each provider file instead of scattered through
 * routes/worker code.
 */
export interface SocialProvider {
  readonly name: SocialProviderName;
  readonly requiredScopes: string[];

  getAuthorizationUrl(state: string, redirectUri: string): string;

  exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthExchangeResult>;

  refreshAccessToken?(refreshToken: string): Promise<{
    accessToken: string;
    expiresInSeconds?: number;
  }>;

  /** Full container-create → wait → publish lifecycle where applicable. */
  publish(input: PublishInput): Promise<PublishResult>;

  getInsights?(accessToken: string, externalPostId: string): Promise<InsightsResult>;
}
