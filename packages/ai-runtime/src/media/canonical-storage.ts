/**
 * Canonical tenant media storage for AI-generated assets.
 * Temporary data: URIs may exist only during processing — never as customer assets.
 */

export interface ResolvedReferenceImage {
  id: string;
  mimeType: string;
  /** Base64 payload for provider inline input (ephemeral). */
  data: string;
  tenantId: string;
  missionId?: string | null;
}

export interface CanonicalStoredAsset {
  assetId: string;
  storageBucket: string;
  storagePath: string;
  /** Non-data URI pointer (storage://bucket/path or https signed later). */
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CanonicalMediaStorage {
  isWritable(): Promise<boolean>;
  resolveReferenceImages(args: {
    tenantId: string;
    missionId?: string | null;
    referenceAssetIds: readonly string[];
  }): Promise<ResolvedReferenceImage[]>;
  persistGeneratedImage(args: {
    tenantId: string;
    missionId: string;
    mimeType: string;
    bytes: Uint8Array;
    originalName: string;
  }): Promise<CanonicalStoredAsset>;
  persistGeneratedVideo?(args: {
    tenantId: string;
    missionId: string;
    mimeType: string;
    bytes: Uint8Array;
    originalName: string;
  }): Promise<CanonicalStoredAsset>;
}

function assertNotDataUri(uri: string): void {
  if (/^data:/i.test(uri)) {
    throw new Error("data_uri_not_allowed_as_canonical_asset");
  }
}

/** In-memory storage for unit tests — enforces tenant isolation and non-data URIs. */
export class InMemoryCanonicalMediaStorage implements CanonicalMediaStorage {
  readonly assets = new Map<
    string,
    {
      tenantId: string;
      missionId?: string | null;
      mimeType: string;
      bytes: Uint8Array;
      storagePath: string;
    }
  >();
  writable = true;

  async isWritable(): Promise<boolean> {
    return this.writable;
  }

  async resolveReferenceImages(args: {
    tenantId: string;
    missionId?: string | null;
    referenceAssetIds: readonly string[];
  }): Promise<ResolvedReferenceImage[]> {
    const out: ResolvedReferenceImage[] = [];
    for (const id of args.referenceAssetIds) {
      const asset = this.assets.get(id);
      if (!asset) throw new Error(`reference_not_found:${id}`);
      if (asset.tenantId !== args.tenantId) {
        throw new Error(`cross_tenant_reference_forbidden:${id}`);
      }
      if (args.missionId && asset.missionId && asset.missionId !== args.missionId) {
        throw new Error(`mission_reuse_forbidden:${id}`);
      }
      out.push({
        id,
        mimeType: asset.mimeType,
        data: Buffer.from(asset.bytes).toString("base64"),
        tenantId: asset.tenantId,
        missionId: asset.missionId,
      });
    }
    return out;
  }

  async persistGeneratedImage(args: {
    tenantId: string;
    missionId: string;
    mimeType: string;
    bytes: Uint8Array;
    originalName: string;
  }): Promise<CanonicalStoredAsset> {
    if (!this.writable) throw new Error("storage_not_writable");
    const assetId = crypto.randomUUID();
    const storagePath = `${args.tenantId}/ai-generated/${assetId}-${args.originalName}`;
    const uri = `storage://ai-media/${storagePath}`;
    assertNotDataUri(uri);
    this.assets.set(assetId, {
      tenantId: args.tenantId,
      missionId: args.missionId,
      mimeType: args.mimeType,
      bytes: args.bytes,
      storagePath,
    });
    return {
      assetId,
      storageBucket: "ai-media",
      storagePath,
      uri,
      mimeType: args.mimeType,
      sizeBytes: args.bytes.byteLength,
    };
  }

  async persistGeneratedVideo(args: {
    tenantId: string;
    missionId: string;
    mimeType: string;
    bytes: Uint8Array;
    originalName: string;
  }): Promise<CanonicalStoredAsset> {
    return this.persistGeneratedImage(args);
  }

  seedReference(args: {
    id: string;
    tenantId: string;
    missionId?: string | null;
    mimeType: string;
    bytes: Uint8Array;
  }): void {
    this.assets.set(args.id, {
      tenantId: args.tenantId,
      missionId: args.missionId,
      mimeType: args.mimeType,
      bytes: args.bytes,
      storagePath: `${args.tenantId}/refs/${args.id}`,
    });
  }
}

export function decodeDataUri(uri: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(uri);
  if (!match) return null;
  return {
    mimeType: match[1]!,
    bytes: Uint8Array.from(Buffer.from(match[2]!, "base64")),
  };
}

export { assertNotDataUri };
