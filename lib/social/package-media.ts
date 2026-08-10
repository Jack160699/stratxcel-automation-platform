import type { ServiceClient } from "@stratxcel/whatsapp";
import type { PackageMediaKind } from "./package-composition.ts";

/** Selects only a real tenant-scoped asset with the required capability.
 * There is deliberately no text fallback for an image/reel package. */
export async function selectPackageMediaAsset(service: ServiceClient, input: { tenantId: string; ownerId: string; mediaType: PackageMediaKind }) {
  if (input.mediaType === "text") return null;
  const mimePrefix = input.mediaType === "reel" || input.mediaType === "video" ? "video/" : "image/";
  const { data } = await service.from("social_media_assets").select("id,mime_type").eq("tenant_id", input.tenantId).eq("owner_id", input.ownerId).like("mime_type", `${mimePrefix}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error("media_capability_unavailable");
  return data as { id: string; mime_type: string };
}
