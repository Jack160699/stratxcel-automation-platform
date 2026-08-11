/**
 * Typed media identity wrappers — attachmentId vs mediaAssetId must never swap.
 */

import { isUuid, requireUuid } from "./id-validation.ts";

export type AttachmentId = string & { readonly __brand: "AttachmentId" };
export type MediaAssetId = string & { readonly __brand: "MediaAssetId" };

export class MediaIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaIdentityError";
  }
}

export function asAttachmentId(value: unknown, field = "attachmentId"): AttachmentId {
  if (!isUuid(value)) {
    throw new MediaIdentityError(`${field}_must_be_attachment_uuid`);
  }
  return value as AttachmentId;
}

export function asMediaAssetId(value: unknown, field = "mediaAssetId"): MediaAssetId {
  if (!isUuid(value)) {
    throw new MediaIdentityError(`${field}_must_be_media_asset_uuid`);
  }
  return value as MediaAssetId;
}

/**
 * Reject when a caller passes mediaAssetId into an attachmentId slot (or vice versa)
 * by requiring the declared field name to match the semantic type.
 * Runtime cannot prove semantic origin from UUID shape alone, so tools must call the
 * matching helper for the parameter they accept — never requireUuid for both.
 */
export function requireAttachmentId(value: unknown): AttachmentId {
  return asAttachmentId(value, "attachmentId");
}

export function requireMediaAssetId(value: unknown): MediaAssetId {
  return asMediaAssetId(value, "mediaAssetId");
}

/** Block ambiguous payloads that provide the wrong key for the expected slot. */
export function assertAttachmentSlot(args: Record<string, unknown>): AttachmentId {
  if (Object.hasOwn(args, "mediaAssetId") && !Object.hasOwn(args, "attachmentId")) {
    throw new MediaIdentityError("attachmentId_required_mediaAssetId_rejected");
  }
  if (Object.hasOwn(args, "mediaAssetId") && Object.hasOwn(args, "attachmentId")) {
    // Both present: attachment path wins only when attachmentId is valid; never treat media as attachment.
    requireUuid(args.attachmentId, "attachmentId");
    if (args.attachmentId === args.mediaAssetId) {
      throw new MediaIdentityError("attachmentId_and_mediaAssetId_must_differ");
    }
  }
  return requireAttachmentId(args.attachmentId);
}

export function assertMediaAssetSlot(args: Record<string, unknown>): MediaAssetId {
  if (Object.hasOwn(args, "attachmentId") && !Object.hasOwn(args, "mediaAssetId")) {
    throw new MediaIdentityError("mediaAssetId_required_attachmentId_rejected");
  }
  if (Object.hasOwn(args, "attachmentId") && Object.hasOwn(args, "mediaAssetId")) {
    requireUuid(args.mediaAssetId, "mediaAssetId");
    if (args.attachmentId === args.mediaAssetId) {
      throw new MediaIdentityError("attachmentId_and_mediaAssetId_must_differ");
    }
  }
  return requireMediaAssetId(args.mediaAssetId);
}
