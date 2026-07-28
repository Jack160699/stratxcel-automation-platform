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
  return (
    exactScope &&
    authorization.platform === "youtube" &&
    authorization.purpose === "YOUTUBE_PRIVATE_VERIFICATION" &&
    authorization.status === "ACTIVE" &&
    Date.parse(authorization.expiresAt) > (input.now ?? Date.now()) &&
    input.accountPlatform === "youtube" &&
    input.privacyStatus === "private" &&
    input.assetMimeType === "video/mp4"
  );
}
