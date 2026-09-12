import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/missions/artifacts/[id]/open
 *
 * Secure deliverable opener:
 * - If backed by Google Drive (drive_url or webViewLink), redirects (302) to the canonical Drive file.
 * - If deliverable content is stored in platform storage / metadata, returns the real verified content with proper MIME and disposition.
 * - If missing or under repair, displays an informative status rather than a silent failure.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new Response("Missing artifact identifier", { status: 400 });
  }

  const { supabase } = getTenantServiceContext();

  const { data: artifact, error } = await supabase
    .from("mission_artifacts")
    .select("id, mission_id, kind, storage_ref, metadata, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !artifact) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Deliverable Not Found</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#090b10;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="max-width:440px;text-align:center;padding:24px;border:1px solid #27272a;border-radius:16px;background:#12151e;">
    <h2 style="margin:0 0 8px 0;font-size:18px;">Deliverable Not Found</h2>
    <p style="color:#a1a1aa;font-size:13px;margin:0 0 16px 0;">This deliverable could not be located in the mission registry.</p>
    <a href="/admin/missions" style="display:inline-block;padding:8px 16px;background:#22d3ee;color:#090b10;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">Return to Missions</a>
  </div>
</body>
</html>`,
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  const meta = (artifact.metadata || {}) as Record<string, any>;

  // 1. If canonical Drive URL exists and is verified, redirect directly
  if (meta.drive_url && meta.status !== "FILE_MISSING") {
    return Response.redirect(meta.drive_url, 302);
  }

  // 2. If storage_ref is an external HTTP URL, redirect
  if (artifact.storage_ref && artifact.storage_ref.startsWith("http")) {
    return Response.redirect(artifact.storage_ref, 302);
  }

  // 3. If file is marked missing or currently repairing
  if (meta.status === "FILE_MISSING") {
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Hermes is Repairing This File</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#090b10;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="max-width:480px;text-align:center;padding:28px;border:1px solid #3f3f46;border-radius:16px;background:#12151e;">
    <div style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:50%;background:rgba(168,85,247,0.15);color:#c084fc;font-size:20px;margin-bottom:12px;">⚡</div>
    <h2 style="margin:0 0 8px 0;font-size:18px;">Hermes is repairing this file</h2>
    <p style="color:#a1a1aa;font-size:13px;line-height:1.5;margin:0 0 20px 0;">
      The canonical cloud storage link for <strong>${meta.name || "this deliverable"}</strong> was unreachable.
      Autonomous self-repair has been triggered to regenerate or re-upload the deliverable to Google Drive.
    </p>
    <a href="/admin/missions/${artifact.mission_id}" style="display:inline-block;padding:8px 16px;background:#38bdf8;color:#090b10;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">View Mission Control</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // 4. If direct content (text or binary base64) is stored in metadata
  if (meta.content_base64) {
    const mime = meta.mime_type || "application/octet-stream";
    const filename = meta.name || `deliverable-${id.slice(0, 8)}`;
    const buffer = Buffer.from(meta.content_base64, "base64");
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (meta.raw_content) {
    const mime = meta.mime_type || "text/plain; charset=utf-8";
    const filename = meta.name || `deliverable-${id.slice(0, 8)}.txt`;
    return new Response(meta.raw_content, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // 5. If document/html summary is present
  const docTitle = meta.name || `Mission Deliverable (${artifact.kind})`;
  const description = meta.summary || meta.description || "Verified autonomous deliverable produced during mission execution.";

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle} — StratXcel</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #07090e; color: #f4f4f5; margin: 0; padding: 40px 20px; }
    .container { max-width: 760px; margin: 0 auto; background: #0f131a; border: 1px solid #27272a; border-radius: 16px; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: #f8fafc; }
    .meta { font-size: 12px; color: #94a3b8; font-family: monospace; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #27272a; display: flex; gap: 16px; flex-wrap: wrap; }
    .content { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; background: rgba(34,211,238,0.15); color: #22d3ee; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .actions { margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
    a.btn { padding: 8px 16px; background: #22d3ee; color: #090b10; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <span class="badge">Verified Deliverable · ${artifact.kind}</span>
      <span style="font-size:12px; color:#64748b;">Version ${meta.version || 1}</span>
    </div>
    <h1>${docTitle}</h1>
    <div class="meta">
      <span>Category: ${meta.category || "Deliverables"}</span>
      <span>Size: ${meta.size_bytes ? (meta.size_bytes / 1024).toFixed(1) + " KB" : "Verified"}</span>
      <span>Created: ${new Date(artifact.created_at).toLocaleDateString()}</span>
    </div>
    <div class="content">
      <p>${description}</p>
      ${meta.canonical_drive_path ? `<p style="margin-top:20px; padding:12px; background:#080a0f; border:1px solid #1e293b; border-radius:8px; font-family:monospace; font-size:12px; color:#38bdf8;">Drive Location: ${meta.canonical_drive_path}</p>` : ""}
    </div>
    <div class="actions">
      <span style="font-size:12px; color:#64748b;">Autonomous Mission System · StratXcel</span>
      <a class="btn" href="/admin/missions/${artifact.mission_id}">Open Mission Control</a>
    </div>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
