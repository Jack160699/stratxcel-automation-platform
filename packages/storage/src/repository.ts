import type { ServiceClient } from "./db.ts";
import type { FolderCategory, StorageConnectionRow, StorageConnectionStatus, StorageFileReferenceRow, StorageProviderKey } from "./types.ts";

export async function getConnection(
  supabase: ServiceClient,
  tenantId: string,
  provider: StorageProviderKey
): Promise<StorageConnectionRow | null> {
  const { data, error } = await supabase
    .from("storage_connections")
    .select("id, tenant_id, provider, status, account_email, scopes, root_folder_id, last_error, connected_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`getConnection: ${error.message}`);
  return (data as StorageConnectionRow) ?? null;
}

export async function upsertConnectionStatus(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    provider: StorageProviderKey;
    status: StorageConnectionStatus;
    accountEmail?: string | null;
    encryptedTokenRef?: string | null;
    scopes?: string[];
    rootFolderId?: string | null;
    lastError?: string | null;
  }
): Promise<StorageConnectionRow> {
  const { data, error } = await supabase
    .from("storage_connections")
    .upsert(
      {
        tenant_id: input.tenantId,
        provider: input.provider,
        status: input.status,
        account_email: input.accountEmail ?? null,
        encrypted_token_ref: input.encryptedTokenRef ?? null,
        scopes: input.scopes ?? [],
        root_folder_id: input.rootFolderId ?? null,
        last_error: input.lastError ?? null,
        connected_at: input.status === "connected" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" }
    )
    .select("id, tenant_id, provider, status, account_email, scopes, root_folder_id, last_error, connected_at, updated_at")
    .single();
  if (error) throw new Error(`upsertConnectionStatus: ${error.message}`);
  return data as StorageConnectionRow;
}

export async function disconnectProvider(supabase: ServiceClient, tenantId: string, provider: StorageProviderKey): Promise<void> {
  const { error } = await supabase
    .from("storage_connections")
    .update({ status: "disconnected", encrypted_token_ref: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
  if (error) throw new Error(`disconnectProvider: ${error.message}`);
}

export async function recordFileReference(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    storageConnectionId: string;
    providerFileId: string;
    folderCategory: FolderCategory;
    fileName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    metadata?: Record<string, unknown>;
  }
): Promise<StorageFileReferenceRow> {
  const { data, error } = await supabase
    .from("storage_file_references")
    .insert({
      tenant_id: input.tenantId,
      storage_connection_id: input.storageConnectionId,
      provider_file_id: input.providerFileId,
      folder_category: input.folderCategory,
      file_name: input.fileName,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id, tenant_id, storage_connection_id, provider_file_id, folder_category, file_name, mime_type, size_bytes, metadata, created_at, updated_at")
    .single();
  if (error) throw new Error(`recordFileReference: ${error.message}`);
  return data as StorageFileReferenceRow;
}

export async function listFileReferences(
  supabase: ServiceClient,
  tenantId: string,
  folderCategory?: FolderCategory
): Promise<StorageFileReferenceRow[]> {
  let query = supabase
    .from("storage_file_references")
    .select("id, tenant_id, storage_connection_id, provider_file_id, folder_category, file_name, mime_type, size_bytes, metadata, created_at, updated_at")
    .eq("tenant_id", tenantId);
  if (folderCategory) query = query.eq("folder_category", folderCategory);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listFileReferences: ${error.message}`);
  return (data ?? []) as StorageFileReferenceRow[];
}

export async function deleteFileReference(supabase: ServiceClient, tenantId: string, providerFileId: string): Promise<void> {
  const { error } = await supabase
    .from("storage_file_references")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider_file_id", providerFileId);
  if (error) throw new Error(`deleteFileReference: ${error.message}`);
}
