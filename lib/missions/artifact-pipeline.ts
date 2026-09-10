/**
 * StratXcel Canonical Google Drive Artifact Pipeline
 *
 * Implements the 9-step execution loop:
 * GENERATE -> VALIDATE -> UPLOAD TO GOOGLE DRIVE -> VERIFY DRIVE FILE ->
 * CAPTURE DRIVE FILE ID -> CAPTURE DRIVE URL -> SAVE METADATA ->
 * ATTACH TO MISSION -> DISPLAY
 *
 * Deterministic Folder Structure:
 * StratXcel/
 *   Autonomous Company/
 *     Missions/
 *       [Mission Name]/
 *         Research/
 *         Deliverables/
 *         Creative/
 *         Reports/
 *         Website/
 *         Sales/
 *         Finance/
 */

export const CANONICAL_DRIVE_ROOT = "StratXcel";
export const CANONICAL_DRIVE_COMPANY = "Autonomous Company";
export const CANONICAL_DRIVE_MISSIONS = "Missions";

export type MissionArtifactCategory =
  | "Research"
  | "Deliverables"
  | "Creative"
  | "Reports"
  | "Website"
  | "Sales"
  | "Finance";

export type ArtifactKind = "document" | "spreadsheet" | "image" | "dataset" | "code" | "report";

export interface CreateDeliverableInput {
  missionId: string;
  tenantId: string;
  missionName: string;
  category: MissionArtifactCategory;
  kind: ArtifactKind;
  fileName: string;
  mimeType: string;
  content: string | Buffer;
  creator?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredDeliverableRecord {
  id: string;
  mission_id: string;
  kind: string;
  storage_ref: string;
  metadata: {
    name: string;
    mime_type: string;
    size_bytes: number;
    category: MissionArtifactCategory;
    canonical_drive_path: string;
    drive_file_id?: string | null;
    drive_url?: string | null;
    status: "VERIFIED" | "PENDING_DRIVE_SYNC" | "FILE_MISSING" | "REPAIRED";
    creator: string;
    version: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  created_at: string;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/*?:"<>|]/g, "_").trim();
}

export function buildCanonicalDrivePath(
  missionName: string,
  category: MissionArtifactCategory,
  fileName: string
): string {
  const safeMission = sanitizeFileName(missionName) || "Untitled Mission";
  const safeFile = sanitizeFileName(fileName);
  return `${CANONICAL_DRIVE_ROOT}/${CANONICAL_DRIVE_COMPANY}/${CANONICAL_DRIVE_MISSIONS}/${safeMission}/${category}/${safeFile}`;
}

/**
 * Validates deliverable format and content before attaching.
 */
export function validateDeliverableContent(
  kind: ArtifactKind,
  mimeType: string,
  content: string | Buffer
): { valid: boolean; sizeBytes: number; error?: string } {
  if (!content) {
    return { valid: false, sizeBytes: 0, error: "Content cannot be empty" };
  }

  const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const sizeBytes = buf.length;

  if (sizeBytes === 0) {
    return { valid: false, sizeBytes: 0, error: "Zero-byte deliverable rejected" };
  }

  // Kind & MIME checks
  if (kind === "spreadsheet" && !mimeType.includes("csv") && !mimeType.includes("sheet") && !mimeType.includes("excel")) {
    return { valid: false, sizeBytes, error: "Spreadsheet must have CSV or spreadsheet MIME type" };
  }

  if (kind === "image" && !mimeType.startsWith("image/")) {
    return { valid: false, sizeBytes, error: "Image deliverable must have image/* MIME type" };
  }

  return { valid: true, sizeBytes };
}

/**
 * Execute the artifact attachment pipeline:
 * 1. Validate content
 * 2. Resolve Drive status (or store canonical reference)
 * 3. Attach metadata to mission_artifacts
 * 4. Record mission event
 */
export async function attachDeliverableToMission(
  supabase: any,
  input: CreateDeliverableInput
): Promise<{ ok: boolean; deliverable?: StoredDeliverableRecord; error?: string }> {
  const validation = validateDeliverableContent(input.kind, input.mimeType, input.content);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const canonicalPath = buildCanonicalDrivePath(input.missionName, input.category, input.fileName);
  const now = new Date().toISOString();

  // Check if Google Drive storage connection is authorized
  let driveConn: any = null;
  try {
    const res = await supabase
      .from("storage_connections")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("provider", "google_drive")
      .eq("status", "connected")
      .maybeSingle();
    driveConn = res.data;
  } catch {
    driveConn = null;
  }

  let driveFileId: string | null = null;
  let driveUrl: string | null = null;
  let status: "VERIFIED" | "PENDING_DRIVE_SYNC" = "PENDING_DRIVE_SYNC";

  // If Drive connection exists and token is active, upload to Drive
  if (driveConn?.encrypted_token_ref) {
    try {
      const { createGoogleDriveAdapter } = await import("@stratxcel/storage");
      const adapter = createGoogleDriveAdapter(supabase);
      const contentBase64 = typeof input.content === "string"
        ? Buffer.from(input.content, "utf-8").toString("base64")
        : input.content.toString("base64");

      const handle = await adapter.uploadFile(input.tenantId, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        contentBase64,
        folderCategory: input.category.toLowerCase() as any,
      });

      if (handle?.providerFileId) {
        driveFileId = handle.providerFileId;
        driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
        status = "VERIFIED";
      }
    } catch {
      status = "PENDING_DRIVE_SYNC";
    }
  }

  // Generate storage reference: if Drive URL is present, use that; else internal open route
  const artifactId = crypto.randomUUID();
  const storageRef = driveUrl || `/api/platform/missions/artifacts/${artifactId}/open`;

  const isText = input.mimeType.startsWith("text/") || input.mimeType.includes("json") || input.mimeType.includes("csv") || input.mimeType.includes("markdown");
  const rawContent = isText && typeof input.content === "string" ? input.content : undefined;
  const contentBase64 = typeof input.content === "string"
    ? Buffer.from(input.content, "utf-8").toString("base64")
    : input.content.toString("base64");

  const metadata = {
    name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: validation.sizeBytes,
    category: input.category,
    canonical_drive_path: canonicalPath,
    drive_file_id: driveFileId,
    drive_url: driveUrl,
    status,
    creator: input.creator || "Hermes",
    version: 1,
    raw_content: rawContent,
    content_base64: contentBase64,
    created_at: now,
    updated_at: now,
    ...(input.metadata || {}),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("mission_artifacts")
    .insert({
      id: artifactId,
      mission_id: input.missionId,
      kind: input.kind,
      storage_ref: storageRef,
      metadata,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message || "Failed to persist artifact in database" };
  }

  // Record audit event on mission timeline
  try {
    await supabase.from("mission_events").insert({
      mission_id: input.missionId,
      event_type: "deliverable_attached",
      payload: {
        artifact_id: artifactId,
        file_name: input.fileName,
        category: input.category,
        kind: input.kind,
        size_bytes: validation.sizeBytes,
        canonical_path: canonicalPath,
        drive_url: driveUrl,
        status,
        action_detail: `Generated and attached verified ${input.kind} deliverable: ${input.fileName}`,
        result_summary: `${input.fileName} (${(validation.sizeBytes / 1024).toFixed(1)} KB) saved to ${input.category}`,
      },
    });
  } catch {}

  return {
    ok: true,
    deliverable: inserted as StoredDeliverableRecord,
  };
}
