import { GEMINI_MODEL } from "@/lib/social/agent/gemini-boundary";

export interface TranscriptionResult {
  text: string;
  language: string | null;
  structuredExtraction: {
    tasks: string[];
    decisions: string[];
    ideas: string[];
    followUps: string[];
    openLoops: string[];
    selfReportedMood: string | null;
    projectReferences: string[];
    peopleReferences: string[];
  };
}

const EXTRACTION_INSTRUCTION = `Transcribe this voice note verbatim first, then extract structured signal from it.
Respond with ONLY a JSON object, no markdown fences, matching exactly:
{"transcript": string, "language": string|null, "tasks": string[], "decisions": string[], "ideas": string[], "followUps": string[], "openLoops": string[], "selfReportedMood": string|null, "projectReferences": string[], "peopleReferences": string[]}
Leave arrays empty (not omitted) when nothing of that kind is present. Do not invent content not actually said.`;

/**
 * Reuses GEMINI_API_KEY (same key Social Autopilot's agent already uses)
 * rather than requiring a second provider credential — cost-conscious per
 * the brief, and one real (not mocked) provider is better than a second
 * half-wired one. Gemini's generateContent accepts inline audio directly,
 * so transcription + structured extraction happen in one call instead of
 * a separate STT step followed by a second LLM pass.
 */
export async function transcribeVoiceNote(audioBase64: string, mimeType: string): Promise<TranscriptionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured — required for voice-note transcription");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: EXTRACTION_INSTRUCTION }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
          },
        ],
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini transcription failed: HTTP ${response.status}`);

  const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error("Gemini returned no transcription content");

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  let parsed: {
    transcript: string;
    language: string | null;
    tasks?: string[];
    decisions?: string[];
    ideas?: string[];
    followUps?: string[];
    openLoops?: string[];
    selfReportedMood?: string | null;
    projectReferences?: string[];
    peopleReferences?: string[];
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini transcription response was not valid JSON");
  }

  return {
    text: parsed.transcript,
    language: parsed.language ?? null,
    structuredExtraction: {
      tasks: parsed.tasks ?? [],
      decisions: parsed.decisions ?? [],
      ideas: parsed.ideas ?? [],
      followUps: parsed.followUps ?? [],
      openLoops: parsed.openLoops ?? [],
      selfReportedMood: parsed.selfReportedMood ?? null,
      projectReferences: parsed.projectReferences ?? [],
      peopleReferences: parsed.peopleReferences ?? [],
    },
  };
}
