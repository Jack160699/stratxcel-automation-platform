export interface VerificationAuthorizationScope {
  ownerId: string;
  accountId: string;
  variantId: string;
  assetId: string;
  jobId: string;
}

export interface VerificationAuthorizationRecord extends VerificationAuthorizationScope {
  platform: string;
  purpose: string;
  status: string;
  expiresAt: string;
  // privacy_status column from migration; legacy rows may lack this, treat as 'private' for compatibility
  privacyStatus?: string | null;
}

export function verificationAuthorizationAllows(
  authorization: VerificationAuthorizationRecord,
  requested: VerificationAuthorizationScope,
  input: { accountPlatform: string; privacyStatus: string; assetMimeType: string; now?: number }
) {
  const exactScope =
    authorization.ownerId === requested.ownerId &&
    authorization.accountId === requested.accountId &&
    authorization.variantId === requested.variantId &&
    authorization.assetId === requested.assetId &&
    authorization.jobId === requested.jobId;

  // Normalize the authorization privacy (back-compat: null => 'private')
  const authPrivacy = (authorization.privacyStatus ?? "private").toLowerCase();
  const reqPrivacy = (input.privacyStatus ?? "").toLowerCase();

  // Explicit allowlist for privacy values
  const allowedPrivacy = reqPrivacy === "private" || reqPrivacy === "unlisted";
  const authPrivacyAllowed = authPrivacy === "private" || authPrivacy === "unlisted";

  return (
    exactScope &&
    authorization.platform === "youtube" &&
    authorization.purpose === "YOUTUBE_PRIVATE_VERIFICATION" &&
    authorization.status === "ACTIVE" &&
    Date.parse(authorization.expiresAt) > (input.now ?? Date.now()) &&
    input.accountPlatform === "youtube" &&
    // requested privacy must be a supported value AND the authorization must explicitly allow it
    allowedPrivacy &&
    authPrivacyAllowed &&
    reqPrivacy === authPrivacy &&
    // asset must be MP4
    input.assetMimeType === "video/mp4"
  );
}
