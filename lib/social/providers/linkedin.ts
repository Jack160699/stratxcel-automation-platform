import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
} from "./types";
import { toLinkedInApiError } from "../errors";

/**
 * LinkedIn — "Sign In with LinkedIn using OpenID Connect" (profile identity)
 * plus "Share on LinkedIn" (posting) products. Both are self-serve on the
 * LinkedIn Developer Portal — no special partner approval required, unlike
 * organization/company-page posting (Marketing Developer Platform), which
 * this integration intentionally does not attempt. Posts publish to the
 * connected member's own personal profile.
 *
 * Docs:
 *  - https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 *  - https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
 */

const API_VERSION = "202405"; // LinkedIn-Version header, YYYYMM
const REST = "https://api.linkedin.com/rest";
const OAUTH = "https://www.linkedin.com/oauth/v2";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function restHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export const linkedinProvider: SocialProvider = {
  name: "linkedin",
  requiredScopes: ["openid", "profile", "w_member_social"],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("LINKEDIN_CLIENT_ID");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: linkedinProvider.requiredScopes.join(" "),
    });
    return `${OAUTH}/authorization?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = requireEnv("LINKEDIN_CLIENT_ID");
    const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");

    const tokenRes = await fetch(`${OAUTH}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      throw await toLinkedInApiError(tokenRes, "LinkedIn token exchange");
    }
    const token = (await tokenRes.json()) as { access_token: string; expires_in?: number };

    // OIDC userinfo endpoint — "sub" is the member's opaque LinkedIn ID, used
    // to build the person URN required as the "author" on every post.
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileRes.ok) {
      throw await toLinkedInApiError(profileRes, "LinkedIn profile fetch");
    }
    const profile = (await profileRes.json()) as {
      sub: string;
      name?: string;
      picture?: string;
      email?: string;
    };

    return {
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
      externalAccountId: `urn:li:person:${profile.sub}`,
      displayName: profile.name,
      username: profile.email,
      profilePictureUrl: profile.picture,
      scopes: linkedinProvider.requiredScopes,
    };
  },

  // LinkedIn access tokens are ~60 days and there is no refresh_token on the
  // standard (non-partner) product — reconnecting via OAuth is the supported
  // renewal path, so this is intentionally not implemented.

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalAccountId: author, caption, mediaUrls } = input;

    let media: { status: string; media: string }[] | undefined;

    if (mediaUrls.length > 0) {
      const assetUrn = await uploadImageAsset(accessToken, author, mediaUrls[0]);
      media = [{ status: "READY", media: assetUrn }];
    }

    const body = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: media ? "IMAGE" : "NONE",
          ...(media ? { media } : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const res = await fetch(`${REST}/ugcPosts`, {
      method: "POST",
      headers: { ...restHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await toLinkedInApiError(res, "LinkedIn publish");
    }
    // A successful ugcPosts create returns the post's URN in the
    // x-restli-id response header rather than a JSON body.
    const postUrn = res.headers.get("x-restli-id") ?? "unknown";
    const numericId = postUrn.split(":").pop();
    const permalink = numericId ? `https://www.linkedin.com/feed/update/${postUrn}/` : undefined;

    return { externalPostId: postUrn, permalink, raw: { urn: postUrn } };
  },

  async getInsights(): Promise<InsightsResult> {
    // Social Actions / analytics on personal-profile posts require the
    // Marketing Developer Platform (separate partner approval) — not
    // available on the self-serve Share on LinkedIn product this
    // integration uses. Returns no metrics rather than fabricating any.
    return { metrics: {} };
  },
};

/**
 * LinkedIn image posting is a three-step dance: register the upload (get a
 * short-lived signed PUT URL + the asset's URN), PUT the raw image bytes to
 * that URL, then reference the asset URN in the post body above. mediaUrls
 * are public URLs (not local files), so the image is fetched here first and
 * its bytes re-uploaded to LinkedIn's asset store.
 */
async function uploadImageAsset(accessToken: string, author: string, imageUrl: string): Promise<string> {
  const registerRes = await fetch(`${REST}/assets?action=registerUpload`, {
    method: "POST",
    headers: { ...restHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: author,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });
  if (!registerRes.ok) {
    throw await toLinkedInApiError(registerRes, "LinkedIn asset registration");
  }
  const register = (await registerRes.json()) as {
    value: {
      asset: string;
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
          uploadUrl: string;
        };
      };
    };
  };

  const uploadUrl =
    register.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
  const assetUrn = register.value.asset;

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Could not fetch media URL for LinkedIn upload: ${imageRes.status}`);
  const imageBytes = await imageRes.arrayBuffer();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: imageBytes,
  });
  if (!putRes.ok) {
    throw await toLinkedInApiError(putRes, "LinkedIn asset upload");
  }

  return assetUrn;
}
