import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
} from "./types";
import { toYouTubeApiError } from "../errors";
import { normalizeYouTubePrivacyStatus } from "./youtube-visibility";

/**
 * YouTube — Google OAuth2 + YouTube Data API v3. Unlike the other providers,
 * "publishing" here means uploading a video, not posting a caption to a
 * feed: PublishInput.mediaUrls[0] must point at a video file, and
 * caption's first line becomes the video title (YouTube has no separate
 * title field elsewhere in the shared content model).
 *
 * Docs:
 *  - https://developers.google.com/identity/protocols/oauth2/web-server
 *  - https://developers.google.com/youtube/v3/guides/uploading_a_video
 */

const OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const YT = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const youtubeProvider: SocialProvider = {
  name: "youtube",
  requiredScopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: youtubeProvider.requiredScopes.join(" "),
      // access_type=offline + prompt=consent are required to get a
      // refresh_token back — Google only issues one on the *first* consent
      // unless prompt=consent forces the dialog every time.
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");

    const tokenRes = await fetch(OAUTH_TOKEN, {
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
    if (!tokenRes.ok) {
      throw await toYouTubeApiError(tokenRes, "YouTube token exchange");
    }
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const channelRes = await fetch(`${YT}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!channelRes.ok) {
      throw await toYouTubeApiError(channelRes, "YouTube channel fetch");
    }
    const channels = (await channelRes.json()) as {
      items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[];
    };
    const channel = channels.items?.[0];
    if (!channel) throw new Error("No YouTube channel found for this Google account");

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresInSeconds: token.expires_in,
      externalAccountId: channel.id,
      displayName: channel.snippet?.title,
      profilePictureUrl: channel.snippet?.thumbnails?.default?.url,
      scopes: youtubeProvider.requiredScopes,
    };
  },

  async refreshAccessToken(refreshToken) {
    const clientId = requireEnv("YOUTUBE_CLIENT_ID");
    const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");

    const res = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw await toYouTubeApiError(res, "YouTube token refresh");
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls } = input;
    const privacyStatus = normalizeYouTubePrivacyStatus(input.privacyStatus);
    if (mediaUrls.length === 0) {
      throw new Error("YouTube publish requires a video media URL");
    }

    const [firstLine, ...rest] = caption.split("\n");
    const title = (firstLine || "Untitled").slice(0, 100);
    const description = (rest.join("\n") || caption).slice(0, 5000);

    const videoRes = await fetch(mediaUrls[0]);
    if (!videoRes.ok || !videoRes.body) {
      throw new Error(`Could not fetch video media URL for YouTube upload: ${videoRes.status}`);
    }
    const videoBytes = await videoRes.arrayBuffer();
    const contentType = videoRes.headers.get("content-type") ?? "video/*";

    // Keep the video bytes and their metadata/privacy in one multipart
    // request. If YouTube accepts it, the returned video already has the
    // requested visibility; if it rejects it, no metadata-less upload is
    // left behind for a retry to duplicate.
    const boundary = `stratxcel-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const metadata = JSON.stringify({
      snippet: { title, description, categoryId: "22" },
      status: { privacyStatus },
    });
    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
      ),
      Buffer.from(videoBytes),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${YT_UPLOAD}?uploadType=multipart&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!uploadRes.ok) {
      throw await toYouTubeApiError(uploadRes, "YouTube video upload");
    }
    const uploaded = (await uploadRes.json()) as { id: string };

    return {
      externalPostId: uploaded.id,
      permalink: `https://youtu.be/${uploaded.id}`,
      raw: { ...uploaded, privacyStatus },
    };
  },

  async getInsights(accessToken, externalPostId): Promise<InsightsResult> {
    const res = await fetch(
      `${YT}/videos?part=statistics&id=${encodeURIComponent(externalPostId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return { metrics: {} };
    const data = (await res.json()) as {
      items?: { statistics?: Record<string, string> }[];
    };
    const stats = data.items?.[0]?.statistics ?? {};
    const metrics: Record<string, number> = {};
    for (const [key, value] of Object.entries(stats)) {
      const n = Number(value);
      if (!Number.isNaN(n)) metrics[key] = n;
    }
    return { metrics };
  },
};
