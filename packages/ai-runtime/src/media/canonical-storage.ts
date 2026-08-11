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

export const CANONICAL_MEDIA_BUCKET = "social-agent-attachments";

function assertNotDataUri(uri: string): void {
  if (/^data:/i.test(uri)) {
    throw new Error("data_uri_not_allowed_as_canonical_asset");
  }
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "-").slice(0, 120) || "media.bin";
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
    const storagePath = `${args.tenantId}/ai-generated/${assetId}-${safeFileName(args.originalName)}`;
    const uri = `storage://${CANONICAL_MEDIA_BUCKET}/${storagePath}`;
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
      storageBucket: CANONICAL_MEDIA_BUCKET,
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

export interface SupabaseCanonicalMediaClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
        maybeSingle?: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    delete: () => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        opts?: { contentType?: string; upsert?: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>;
      download: (path: string) => PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
      list?: (
        path?: string,
        opts?: { limit?: number },
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

/**
 * Production canonical media storage backed by Supabase Storage + social_media_assets.
 */
export class SupabaseCanonicalMediaStorage implements CanonicalMediaStorage {
  private readonly client: SupabaseCanonicalMediaClient;
  private readonly ownerId: string;
  private readonly bucket: string;

  constructor(args: { client: SupabaseCanonicalMediaClient; ownerId: string; bucket?: string }) {
    this.client = args.client;
    this.ownerId = args.ownerId;
    this.bucket = args.bucket ?? CANONICAL_MEDIA_BUCKET;
  }

  async isWritable(): Promise<boolean> {
    try {
      const probePath = `${this.ownerId}/.ai-runtime-write-probe`;
      const { error } = await this.client.storage.from(this.bucket).upload(probePath, new Uint8Array([1]), {
        contentType: "application/octet-stream",
        upsert: true,
      });
      return !error;
    } catch {
      return false;
    }
  }

  async resolveReferenceImages(args: {
    tenantId: string;
    missionId?: string | null;
    referenceAssetIds: readonly string[];
  }): Promise<ResolvedReferenceImage[]> {
    if (!args.referenceAssetIds.length) return [];
    const { data, error } = await this.client
      .from("social_media_assets")
      .select("id,tenant_id,owner_id,storage_bucket,storage_path,mime_type,status")
      .eq("tenant_id", args.tenantId)
      .in("id", [...args.referenceAssetIds]);
    if (error) throw new Error(`reference_query_failed:${error.message}`);
    const rows = data ?? [];
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const out: ResolvedReferenceImage[] = [];
    for (const id of args.referenceAssetIds) {
      const row = byId.get(id);
      if (!row || String(row.status) !== "READY") throw new Error(`reference_not_found:${id}`);
      if (String(row.tenant_id) !== args.tenantId) {
        throw new Error(`cross_tenant_reference_forbidden:${id}`);
      }
      const bucket = String(row.storage_bucket ?? this.bucket);
      const path = String(row.storage_path);
      const downloaded = await this.client.storage.from(bucket).download(path);
      if (downloaded.error || !downloaded.data) {
        throw new Error(`reference_bytes_unavailable:${id}`);
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      out.push({
        id,
        mimeType: String(row.mime_type ?? "image/png"),
        data: Buffer.from(bytes).toString("base64"),
        tenantId: args.tenantId,
        missionId: args.missionId,
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
    const assetId = crypto.randomUUID();
    const storagePath = `${args.tenantId}/ai-generated/${assetId}-${safeFileName(args.originalName)}`;
    const uri = `storage://${this.bucket}/${storagePath}`;
    assertNotDataUri(uri);

    const upload = await this.client.storage.from(this.bucket).upload(storagePath, args.bytes, {
      contentType: args.mimeType,
      upsert: false,
    });
    if (upload.error) throw new Error(`canonical_upload_failed:${upload.error.message}`);

    const ext = args.originalName.includes(".") ? args.originalName.split(".").pop()! : "bin";
    const inserted = await this.client
      .from("social_media_assets")
      .insert({
        id: assetId,
        owner_id: this.ownerId,
        tenant_id: args.tenantId,
        storage_bucket: this.bucket,
        storage_path: storagePath,
        original_name: args.originalName.slice(0, 255),
        extension: ext.slice(0, 16),
        mime_type: args.mimeType,
        size_bytes: args.bytes.byteLength,
        status: "READY",
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(`canonical_metadata_failed:${inserted.error?.message ?? "unknown"}`);
    }

    return {
      assetId,
      storageBucket: this.bucket,
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
