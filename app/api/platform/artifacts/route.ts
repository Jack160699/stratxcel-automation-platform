import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { listFileReferences, getConnection, type FolderCategory, type StorageProviderKey } from "@stratxcel/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FOLDER_CATEGORIES: FolderCategory[] = [
  "brand_assets",
  "source_uploads",
  "social_media",
  "campaigns",
  "website",
  "reports",
  "proposals",
  "legal_documents",
  "archive",
];

/**
 * First API route for @stratxcel/storage's file-reference listing — the
 * package, its Google Drive OAuth adapter, and the tenant-scoped
 * storage_connections/storage_file_references tables
 * (supabase/migrations/20260803180000_storage_drive_foundation.sql) already
 * existed with nothing reading them. Both tables have tenant-read RLS, so
 * this plain listing runs on the authenticated session client. No upload
 * endpoint exists here — uploads require a connected provider, which this
 * build phase does not activate (STRATEXCEL_AI_MASTER_BUILD_BRIEF.md's
 * non-negotiable rule against unapproved production/integration activation).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  const folderCategoryParam = url.searchParams.get("folderCategory");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  if (folderCategoryParam && !VALID_FOLDER_CATEGORIES.includes(folderCategoryParam as FolderCategory)) {
    return Response.json({ error: `folderCategory must be one of ${VALID_FOLDER_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const artifacts = await listFileReferences(ctx.supabase, tenantId, folderCategoryParam as FolderCategory | undefined);
  const connection = await getConnection(ctx.supabase, tenantId, "google_drive" as StorageProviderKey);

  return Response.json({ artifacts, connection }, { headers: { "Cache-Control": "no-store" } });
}
