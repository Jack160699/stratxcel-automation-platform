import crypto from "node:crypto";
import type { FolderCategory, StorageConnectionStatus, StorageFileHandle, StorageProvider, UploadFileInput } from "./types.ts";
import { StorageNotConnectedError } from "./types.ts";

interface MockFile extends StorageFileHandle {
  folderCategory: FolderCategory;
  contentBase64: string;
}

/**
 * Fully in-memory implementation of StorageProvider — no network, no
 * database, no OAuth. Used for testing the generic StorageProvider
 * contract and any future consumer code (e.g. mission artifact upload)
 * without needing a real Drive connection tonight, per "use mock Drive
 * tests."
 */
export function createMockStorageProvider(options: { connected?: boolean } = {}): StorageProvider {
  const connected = options.connected ?? true;
  const files = new Map<string, MockFile>();

  function requireConnected() {
    if (!connected) throw new StorageNotConnectedError("stratxcel_managed");
  }

  return {
    provider: "stratxcel_managed",

    async getConnectionStatus(): Promise<StorageConnectionStatus> {
      return connected ? "connected" : "disconnected";
    },

    async uploadFile(_tenantId: string, input: UploadFileInput): Promise<StorageFileHandle> {
      requireConnected();
      const id = crypto.randomUUID();
      const file: MockFile = {
        providerFileId: id,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: Buffer.from(input.contentBase64, "base64").length,
        folderCategory: input.folderCategory,
        contentBase64: input.contentBase64,
      };
      files.set(id, file);
      return file;
    },

    async downloadFile(_tenantId: string, providerFileId: string) {
      requireConnected();
      const file = files.get(providerFileId);
      if (!file) throw new Error(`Mock file ${providerFileId} not found`);
      return { contentBase64: file.contentBase64, mimeType: file.mimeType };
    },

    async copyFile(_tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle> {
      requireConnected();
      const source = files.get(providerFileId);
      if (!source) throw new Error(`Mock file ${providerFileId} not found`);
      const id = crypto.randomUUID();
      const copy: MockFile = { ...source, providerFileId: id, folderCategory: targetFolderCategory };
      files.set(id, copy);
      return copy;
    },

    async moveFile(_tenantId: string, providerFileId: string, targetFolderCategory: FolderCategory): Promise<StorageFileHandle> {
      requireConnected();
      const file = files.get(providerFileId);
      if (!file) throw new Error(`Mock file ${providerFileId} not found`);
      file.folderCategory = targetFolderCategory;
      return file;
    },

    async deleteFileReference(_tenantId: string, providerFileId: string): Promise<void> {
      files.delete(providerFileId);
    },

    async listFiles(_tenantId: string, folderCategory?: FolderCategory): Promise<StorageFileHandle[]> {
      requireConnected();
      return [...files.values()].filter((f) => !folderCategory || f.folderCategory === folderCategory);
    },
  };
}
