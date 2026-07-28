export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const MEDIA_EXTENSIONS: Record<string, ReadonlySet<string>> = {
  "video/mp4": new Set(["mp4"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
};

export function extensionForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return extension === name.toLowerCase() ? "" : extension;
}

export function validateMediaMetadata(input: { name: string; mimeType: string; sizeBytes: number }): string | null {
  const extensions = MEDIA_EXTENSIONS[input.mimeType];
  if (!extensions) return "Unsupported media type. Use MP4, JPEG, PNG, or WebP.";
  const extension = extensionForName(input.name);
  if (!extensions.has(extension)) return `The .${extension || "(missing)"} extension does not match ${input.mimeType}.`;
  const maximum = input.mimeType.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES;
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maximum) {
    return `This ${input.mimeType.startsWith("image/") ? "image" : "video"} must be between 1 byte and ${maximum / 1024 / 1024} MB.`;
  }
  return null;
}
