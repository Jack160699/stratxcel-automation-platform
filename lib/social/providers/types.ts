export type SocialProviderName =
  | "google_business"
  | "google"
  | "instagram"
  | "facebook"
  | "threads"
  | "linkedin"
  | "youtube"
  | "x";

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

export interface SocialProvider {
  readonly name: string;
  readonly requiredScopes: string[];

  getAuthorizationUrl(state: string, redirectUri: string): string;

  exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthExchangeResult>;

  refreshAccessToken?(refreshToken: string): Promise<{
    accessToken: string;
    expiresInSeconds?: number;
  }>;

  publish(input: PublishInput): Promise<PublishResult>;

  getInsights?(accessToken: string, externalPostId: string): Promise<InsightsResult>;
}
