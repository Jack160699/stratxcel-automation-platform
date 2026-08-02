export type StorageProviderKey = "google_drive" | "stratxcel_managed" | "onedrive" | "dropbox" | "s3" | "r2" | "gcs" | "azure_blob";
export type StorageConnectionStatus = "disconnected" | "connecting" | "connected" | "revoked" | "error";
export type FolderCategory =
  | "brand_assets"
  | "source_uploads"
  | "social_media"
  | "campaigns"
  | "website"
  | "reports"
  | "proposals"
  | "legal_documents"
  | "archive";

export interface StorageConnectionRow {
  id: string;
  tenant_id: string;
  provider: StorageProviderKey;
  account_email: string | null;
  encrypted_token_ref: string | null;
  scopes: string[];
  root_folder_id: string | null;
  status: StorageConnectionStatus;
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageFileReferenceRow {
  id: string;
  tenant_id: string;
  storage_connection_id: string;
  provider_file_id: string;
  folder_category: FolderCategory;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UploadFileInput {
  folderCategory: FolderCategory;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface StorageFileHandle {
  providerFileId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export class StorageQuotaExceededError extends Error {
  constructor(provider: string) {
    super(`Storage quota exceeded for provider '${provider}'`);
    this.name = "StorageQuotaExceededError";
  }
}

export class StoragePermissionLostError extends Error {
  constructor(provider: string) {
    super(`Access to '${provider}' storage was revoked or lost — reconnect required`);
    this.name = "StoragePermissionLostError";
  }
}

export class StorageNotConnectedError extends Error {
  constructor(provider: string) {
    super(`No connected '${provider}' storage connection for this tenant`);
    this.name = "StorageNotConnectedError";
  }
}

/**
 * Generic contract every storage backend implements — Google Drive first,
 * with StratExcel-managed storage, OneDrive, Dropbox, S3, R2, GCS, and
 * Azure Blob as future implementations of the exact same interface. Callers
 * (mission artifact handling, Brand Asset uploads) depend only on this,
 * never on a provider-specific client.
 */
export interface StorageProvider {
  readonly provider: StorageProviderKey;
  getConnectionStatus(tenantId: string): Promise<StorageConnectionStatus>;
  uploadFile(tenantId: string, input: UploadFileInput): Promise<StorageFileHandle>;
  downloadFile(tenantId: string, providerFileId: string): Promise<{ contentBase64: string; mimeType: string | null }>;
  copyFile(tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle>;
  moveFile(tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle>;
  /** Removes the platform's reference to the file — for a real provider this may also delete the underlying file, or simply unlink; see each adapter's own doc comment. */
  deleteFileReference(tenantId: string, providerFileId: string): Promise<void>;
  listFiles(tenantId: string, folderCategory?: FolderCategory): Promise<StorageFileHandle[]>;
}
