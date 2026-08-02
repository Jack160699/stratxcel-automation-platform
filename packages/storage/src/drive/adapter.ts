import { createDevEncryptedVault } from "@stratxcel/byok";
import type { ServiceClient } from "../db.ts";
import { getConnection, recordFileReference, deleteFileReference as deleteFileReferenceRow, listFileReferences } from "../repository.ts";
import { getFolderLabel } from "../folder-structure.ts";
import {
  StorageNotConnectedError,
  StoragePermissionLostError,
  type FolderCategory,
  type StorageConnectionStatus,
  type StorageFileHandle,
  type StorageProvider,
  type UploadFileInput,
} from "../types.ts";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

async function getAccessToken(supabase: ServiceClient, tenantId: string): Promise<string> {
  const connection = await getConnection(supabase, tenantId, "google_drive");
  if (!connection || connection.status !== "connected" || !connection.encrypted_token_ref) {
    throw new StorageNotConnectedError("google_drive");
  }
  const vault = createDevEncryptedVault(supabase);
  const token = await vault.retrieve(connection.encrypted_token_ref);
  if (!token) throw new StoragePermissionLostError("google_drive");
  return token;
}

function classifyDriveError(status: number, provider: string): never {
  if (status === 401 || status === 403) throw new StoragePermissionLostError(provider);
  if (status === 507 || status === 403) throw new Error(`Drive quota error (HTTP ${status})`);
  throw new Error(`Drive API error: HTTP ${status}`);
}

/**
 * drive.file scope only (least privilege — see drive/oauth.ts): this
 * adapter can only see/manage files it itself created or that the user
 * explicitly picked with a file picker, never the customer's whole Drive.
 * Every method resolves the tenant's access token via the vault at call
 * time rather than caching it, so a revoked connection (StoragePermissionLostError)
 * is detected on the very next call, not after some stale cache expires.
 */
export function createGoogleDriveAdapter(supabase: ServiceClient): StorageProvider {
  return {
    provider: "google_drive",

    async getConnectionStatus(tenantId: string): Promise<StorageConnectionStatus> {
      const connection = await getConnection(supabase, tenantId, "google_drive");
      return connection?.status ?? "disconnected";
    },

    async uploadFile(tenantId: string, input: UploadFileInput): Promise<StorageFileHandle> {
      const accessToken = await getAccessToken(supabase, tenantId);
      const connection = await getConnection(supabase, tenantId, "google_drive");

      const metadata = { name: input.fileName, parents: connection?.root_folder_id ? [connection.root_folder_id] : undefined };
      const boundary = "stratxcel-drive-upload-boundary";
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${input.contentBase64}\r\n` +
        `--${boundary}--`;

      const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!response.ok) classifyDriveError(response.status, "google_drive");
      const result = (await response.json()) as { id: string; name: string; mimeType: string; size?: string };

      if (connection) {
        await recordFileReference(supabase, {
          tenantId,
          storageConnectionId: connection.id,
          providerFileId: result.id,
          folderCategory: input.folderCategory,
          fileName: result.name,
          mimeType: result.mimeType,
          sizeBytes: result.size ? Number(result.size) : null,
        });
      }

      return { providerFileId: result.id, fileName: result.name, mimeType: result.mimeType, sizeBytes: result.size ? Number(result.size) : null };
    },

    async downloadFile(tenantId: string, providerFileId: string) {
      const accessToken = await getAccessToken(supabase, tenantId);
      const response = await fetch(`${DRIVE_API_BASE}/files/${providerFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) classifyDriveError(response.status, "google_drive");
      const buffer = await response.arrayBuffer();
      return { contentBase64: Buffer.from(buffer).toString("base64"), mimeType: response.headers.get("content-type") };
    },

    async copyFile(tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle> {
      const accessToken = await getAccessToken(supabase, tenantId);
      const response = await fetch(`${DRIVE_API_BASE}/files/${providerFileId}/copy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Copy of ${getFolderLabel(targetFolderCategory)} file` }),
      });
      if (!response.ok) classifyDriveError(response.status, "google_drive");
      const result = (await response.json()) as { id: string; name: string; mimeType: string };
      return { providerFileId: result.id, fileName: result.name, mimeType: result.mimeType, sizeBytes: null };
    },

    async moveFile(tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle> {
      const accessToken = await getAccessToken(supabase, tenantId);
      const connection = await getConnection(supabase, tenantId, "google_drive");
      const response = await fetch(
        `${DRIVE_API_BASE}/files/${providerFileId}?addParents=${connection?.root_folder_id ?? ""}`,
        { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "{}" }
      );
      if (!response.ok) classifyDriveError(response.status, "google_drive");
      const result = (await response.json()) as { id: string; name: string; mimeType: string };

      if (connection) {
        await deleteFileReferenceRow(supabase, tenantId, providerFileId);
        await recordFileReference(supabase, {
          tenantId,
          storageConnectionId: connection.id,
          providerFileId: result.id,
          folderCategory: targetFolderCategory,
          fileName: result.name,
          mimeType: result.mimeType,
        });
      }

      return { providerFileId: result.id, fileName: result.name, mimeType: result.mimeType, sizeBytes: null };
    },

    /**
     * Removes only StratExcel's tracking reference — does NOT delete the
     * underlying Drive file. This is deliberate: it's the customer's Drive
     * (customer-owned storage is the whole point), so "remove from
     * StratExcel" must never silently delete their file. Real deletion
     * would be a separate, explicitly-named operation this interface does
     * not currently expose.
     */
    async deleteFileReference(tenantId: string, providerFileId: string): Promise<void> {
      await deleteFileReferenceRow(supabase, tenantId, providerFileId);
    },

    async listFiles(tenantId: string, folderCategory?: FolderCategory): Promise<StorageFileHandle[]> {
      const refs = await listFileReferences(supabase, tenantId, folderCategory);
      return refs.map((r) => ({ providerFileId: r.provider_file_id, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes }));
    },
  };
}
