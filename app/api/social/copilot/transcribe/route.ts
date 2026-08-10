import { requireOwnerContext } from "@/lib/social/db-context";
import { transcribeVoiceNote } from "@/lib/owner-brain/voice/transcription";
import { createAgentSession, getSession } from "@/lib/social/repositories/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Social-only transcription. It deliberately does not persist an Owner Brain
 * voice note, memory candidate, decision, or open loop. */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const sessionId = form?.get("sessionId");
  if (!(audio instanceof File)) return Response.json({ error: "Audio is required." }, { status: 400 });
  let scopedSessionId = typeof sessionId === "string" && sessionId ? sessionId : null;
  if (scopedSessionId && !(await getSession(ctx, scopedSessionId))) return Response.json({ error: "Session not found." }, { status: 404 });
  scopedSessionId ??= await createAgentSession(ctx, "Voice mission");
  if (audio.size < 1 || audio.size > 25 * 1024 * 1024) return Response.json({ error: "Voice notes must be under 25 MB." }, { status: 413 });
  try {
    const result = await transcribeVoiceNote(Buffer.from(await audio.arrayBuffer()).toString("base64"), audio.type || "audio/webm");
    return Response.json({ transcript: result.text, language: result.language, sessionId: scopedSessionId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not transcribe this voice note. Please try again." }, { status: 502 });
  }
}
