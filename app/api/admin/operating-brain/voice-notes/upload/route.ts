import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/owner-brain/db-context";
import { createVoiceNote, setVoiceNoteStatus, saveTranscript } from "@/lib/owner-brain/repositories/voice-notes";
import { transcribeVoiceNote } from "@/lib/owner-brain/voice/transcription";
import { admitMemoryCandidate } from "@/lib/owner-brain/memory/lifecycle";
import { createOpenLoop } from "@/lib/owner-brain/repositories/open-loops";
import { getSourceByKey, updateSourceStatus } from "@/lib/owner-brain/repositories/sources";

const BUCKET = "owner-voice-notes";

/**
 * POST /api/admin/operating-brain/voice-notes/upload
 * multipart/form-data, field "audio". Uploads to owner-voice-notes (owner-
 * folder-scoped RLS — see migration 20260810123000), creates the
 * owner_voice_notes row, then transcribes synchronously (best-effort: a
 * failed transcription leaves the note as UPLOADED/FAILED rather than
 * losing the upload, and the admin UI can retry). Structured extraction
 * candidates (tasks/decisions/ideas) become memory candidates or open
 * loops only after passing through the same lifecycle policy as every
 * other source — nothing here becomes a durable CONFIRMED memory
 * automatically.
 */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("audio");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  if (file.size > 26214400) return NextResponse.json({ error: "File too large (25MB max)" }, { status: 413 });

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const extension = (file.name.split(".").pop() || "webm").toLowerCase();
  const storagePath = `${ctx.ownerId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await ctx.supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type || "audio/webm" });
  if (uploadError) return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });

  const voiceNoteId = await createVoiceNote(ctx, { audioStorageRef: storagePath });

  try {
    const base64 = bytes.toString("base64");
    const result = await transcribeVoiceNote(base64, file.type || "audio/webm");
    await saveTranscript({
      voiceNoteId,
      text: result.text,
      language: result.language ?? undefined,
      provider: "gemini",
      structuredExtraction: result.structuredExtraction,
    });
    await setVoiceNoteStatus(voiceNoteId, "TRANSCRIBED");

    const voiceSource = await getSourceByKey(ctx, "voice_notes");
    if (voiceSource) await updateSourceStatus(ctx.ownerId, voiceSource.id, {
      status: "CONNECTED", last_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(),
      last_error: null, health: { ready: true, mode: "direct_upload", last_upload_id: voiceNoteId },
    });
    for (const task of result.structuredExtraction.followUps.concat(result.structuredExtraction.openLoops)) {
      await createOpenLoop(ctx.ownerId, { item: task, sourceId: voiceSource?.id ?? null });
    }
    for (const decision of result.structuredExtraction.decisions) {
      await admitMemoryCandidate(ctx.ownerId, {
        category: "decision",
        statement: decision,
        memoryType: "DECISION",
        confidence: 0.6,
        provenance: { sourceId: voiceSource?.id, note: `voice note ${voiceNoteId}` },
      });
    }
    if (result.structuredExtraction.selfReportedMood) {
      await admitMemoryCandidate(ctx.ownerId, {
        category: "mood_energy",
        statement: result.structuredExtraction.selfReportedMood,
        memoryType: "SELF_REPORTED_STATE",
        confidence: 0.7,
        provenance: { sourceId: voiceSource?.id, note: `voice note ${voiceNoteId}` },
      });
    }

    return NextResponse.json({ voiceNoteId, transcribed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setVoiceNoteStatus(voiceNoteId, "FAILED", message);
    const voiceSource = await getSourceByKey(ctx, "voice_notes");
    if (voiceSource) await updateSourceStatus(ctx.ownerId, voiceSource.id, {
      status: "ERROR", last_sync_at: new Date().toISOString(), last_error: message,
      health: { ready: true, mode: "direct_upload", audio_preserved: true, last_upload_id: voiceNoteId },
    });
    return NextResponse.json({ voiceNoteId, transcribed: false, error: "Transcription failed — audio was saved, retry later." }, { status: 202 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
