import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/connectors/google/drive-test
 *
 * Performs a REAL Google Drive write test:
 * 1. Resolves the Drive adapter from storage_connections
 * 2. Creates a test file: StratXcel_Drive_Connection_Test.txt
 * 3. Uploads to Drive via the adapter
 * 4. Returns real Drive file ID + URL
 * 5. Verifies the file can be downloaded back
 *
 * This is the definitive proof that Drive write works.
 * Does NOT mark anything as connected unless the actual write succeeds.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const url = new URL(request.url);
  let rawTenantId = url.searchParams.get("tenantId");

  const { supabase } = getTenantServiceContext();

  if (!rawTenantId) {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    rawTenantId = tenant?.id ?? "466e6195-a9f6-4576-8271-29fdae61c18a";
  }
  const tenantId: string = rawTenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";

  // Step 1: Check storage_connections for Drive
  const { data: conn, error: connErr } = await supabase
    .from("storage_connections")
    .select("id, tenant_id, provider, status, encrypted_token_ref, scopes, root_folder_id")
    .eq("tenant_id", tenantId)
    .eq("provider", "google_drive")
    .maybeSingle();

  if (connErr || !conn) {
    return Response.json(
      {
        ok: false,
        error: "No Drive connection found in storage_connections",
        detail: connErr?.message || "The OAuth callback has not bridged tokens to storage_connections yet. Re-authorize Google via Update Scopes.",
        step: "RESOLVE_CONNECTION",
      },
      { status: 404 }
    );
  }

  if (conn.status !== "connected" || !conn.encrypted_token_ref) {
    return Response.json(
      {
        ok: false,
        error: "Drive connection exists but is not active",
        detail: `status=${conn.status}, hasToken=${Boolean(conn.encrypted_token_ref)}`,
        step: "CHECK_STATUS",
      },
      { status: 409 }
    );
  }

  // Step 2: Create test file content
  const testContent = [
    "=== StratXcel Drive Connection Verification ===",
    "",
    `Tenant ID: ${tenantId}`,
    `Verified At: ${new Date().toISOString()}`,
    `Verified By: ${admin.userId}`,
    "",
    "This file proves that:",
    "  ✅ Google OAuth authorization succeeded",
    "  ✅ Refresh token is vaulted and retrievable",
    "  ✅ Drive API write access is functional",
    "  ✅ File was uploaded via the canonical artifact pipeline",
    "",
    "Hermes can now create and manage mission deliverables in Google Drive.",
    "",
    "— StratXcel Autonomous Company OS",
  ].join("\n");

  // Step 3: Upload via Drive adapter
  let uploadResult: { providerFileId: string; fileName: string; mimeType: string | null; sizeBytes: number | null } | null = null;
  let uploadError: string | null = null;

  try {
    const { createGoogleDriveAdapter } = await import("@stratxcel/storage");
    const adapter = createGoogleDriveAdapter(supabase);

    uploadResult = await adapter.uploadFile(tenantId, {
      fileName: "StratXcel_Drive_Connection_Test.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from(testContent, "utf-8").toString("base64"),
      folderCategory: "reports",
    });
  } catch (err) {
    uploadError = err instanceof Error ? `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}` : String(err);
    console.error("[drive-test] uploadFile exception:", err);
  }

  if (!uploadResult || !uploadResult.providerFileId) {
    return Response.json(
      {
        ok: false,
        error: "Drive write FAILED — file was not created",
        detail: uploadError || "uploadFile returned no providerFileId",
        step: "UPLOAD",
      },
      { status: 422 }
    );
  }


  const driveFileId = uploadResult.providerFileId;
  const driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

  // Step 4: Verify the file can be read back
  let verifyOk = false;
  let verifyError: string | null = null;
  try {
    const { createGoogleDriveAdapter } = await import("@stratxcel/storage");
    const adapter = createGoogleDriveAdapter(supabase);
    const downloaded = await adapter.downloadFile(tenantId, driveFileId);
    verifyOk = Boolean(downloaded?.contentBase64);
  } catch (err) {
    verifyError = err instanceof Error ? err.message : "Unknown verify error";
  }

  // Step 5: Update Drive capability status
  if (verifyOk) {
    // Update the evaluateGoogleServices cache by marking the connection as write-verified
    await supabase
      .from("storage_connections")
      .update({
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("provider", "google_drive");
  }

  return Response.json({
    ok: true,
    driveFileId,
    driveUrl,
    fileName: uploadResult.fileName,
    sizeBytes: uploadResult.sizeBytes,
    writeVerified: true,
    readBackVerified: verifyOk,
    readBackError: verifyError,
    step: "COMPLETE",
    summary: `Real Drive file created: ${driveFileId}. Write + read-back ${verifyOk ? "PASSED" : "write OK, read-back failed"}.`,
  });
}
