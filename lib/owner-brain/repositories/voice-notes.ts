import { getServiceContext, type OwnerContext } from "../db-context";

export async function createVoiceNote(ctx: OwnerContext, input: { audioStorageRef: string; durationSeconds?: number }): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("owner_voice_notes")
    .insert({
      owner_id: ctx.ownerId,
      audio_storage_ref: input.audioStorageRef,
      duration_seconds: input.durationSeconds ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createVoiceNote failed: ${error.message}`);
  return data.id as string;
}

export async function listVoiceNotes(ctx: OwnerContext, limit = 25) {
  const { data, error } = await ctx.supabase
    .from("owner_voice_notes")
    .select("*, owner_transcripts(*)")
    .eq("owner_id", ctx.ownerId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listVoiceNotes failed: ${error.message}`);
  return data ?? [];
}

export async function setVoiceNoteStatus(voiceNoteId: string, status: "UPLOADED" | "TRANSCRIBING" | "TRANSCRIBED" | "FAILED", lastError?: string) {
  const service = getServiceContext().supabase;
  const { error } = await service.from("owner_voice_notes").update({ status, last_error: lastError ?? null }).eq("id", voiceNoteId);
  if (error) throw new Error(`setVoiceNoteStatus failed: ${error.message}`);
}

export async function saveTranscript(input: {
  voiceNoteId: string;
  text: string;
  language?: string;
  provider: string;
  confidence?: number;
  structuredExtraction: Record<string, unknown>;
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service.from("owner_transcripts").insert({
    voice_note_id: input.voiceNoteId,
    text_content: input.text,
    language: input.language ?? null,
    provider: input.provider,
    confidence: input.confidence ?? null,
    structured_extraction: input.structuredExtraction,
  });
  if (error) throw new Error(`saveTranscript failed: ${error.message}`);
}
