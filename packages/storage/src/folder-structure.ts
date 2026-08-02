import type { FolderCategory } from "./types.ts";

/**
 * The planned "StratExcel AI" root folder structure inside a customer's
 * connected Drive. Folder IDs are resolved and cached per-connection at
 * provisioning time (see drive/adapter.ts's provisionFolderStructure) —
 * this is just the fixed plan, in category-key order.
 */
export const FOLDER_STRUCTURE: Record<FolderCategory, string> = {
  brand_assets: "Brand Assets",
  source_uploads: "Source Uploads",
  social_media: "Social Media",
  campaigns: "Campaigns",
  website: "Website",
  reports: "Reports",
  proposals: "Proposals",
  legal_documents: "Legal Documents",
  archive: "Archive",
};

export const ROOT_FOLDER_NAME = "StratExcel AI";

export function getFolderLabel(category: FolderCategory): string {
  return FOLDER_STRUCTURE[category];
}

export function listFolderCategories(): FolderCategory[] {
  return Object.keys(FOLDER_STRUCTURE) as FolderCategory[];
}
