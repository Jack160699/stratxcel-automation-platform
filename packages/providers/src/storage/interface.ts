/**
 * Storage Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface UploadInput {
  tenantId: string;
  projectId?: string;
  path: string;
  contentType: string;
  data: Buffer | Uint8Array | string;
}

export interface StorageResult {
  publicUrl: string;
  path: string;
  sizeBytes: number;
  provider: string;
  uploadedAt: string;
}

export interface StorageProvider {
  name: string;
  upload: (input: UploadInput) => Promise<StorageResult>;
  getUrl: (path: string) => string;
  delete: (path: string) => Promise<boolean>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockStorageProvider implements StorageProvider {
  public name = "mock_storage";
  private files: Map<string, UploadInput> = new Map();

  public async upload(input: UploadInput): Promise<StorageResult> {
    this.files.set(input.path, input);
    return {
      publicUrl: `https://storage.stratxcel.com/${input.tenantId}/${input.path}`,
      path: input.path,
      sizeBytes: typeof input.data === "string" ? input.data.length : input.data.byteLength,
      provider: this.name,
      uploadedAt: new Date().toISOString(),
    };
  }

  public getUrl(path: string): string {
    return `https://storage.stratxcel.com/${path}`;
  }

  public async delete(path: string): Promise<boolean> {
    return this.files.delete(path);
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "storage",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockStorageProvider = new MockStorageProvider();
