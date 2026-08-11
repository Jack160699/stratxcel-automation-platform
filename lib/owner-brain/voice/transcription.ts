import { routeVoiceWorkload, assertVoiceRouteSafe } from "@stratxcel/ai-runtime";
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
 * Prefer OpenAI gpt-4o-mini-transcribe when OPENAI_API_KEY is present.
 * Falls back to Gemini multimodal extraction (existing path) when only GEMINI_API_KEY is set.
 * Never sends permanent API keys to the browser — this module is server-only.
 */
export async function transcribeVoiceNote(audioBase64: string, mimeType: string): Promise<TranscriptionResult> {
  const route = routeVoiceWorkload("transcription");
  assertVoiceRouteSafe(route);

  if (process.env.OPENAI_API_KEY) {
    return transcribeWithOpenAI(audioBase64, mimeType, route.primaryModel);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No transcription provider configured (OPENAI_API_KEY or GEMINI_API_KEY)");

  const model = GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: EXTRACTION_INSTRUCTION }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini transcription failed: HTTP ${response.status}`);
  return parseGeminiTranscription(await response.json());
}

async function transcribeWithOpenAI(audioBase64: string, mimeType: string, model: string): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const binary = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([binary], { type: mimeType }), "voice.webm");
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`OpenAI transcription failed: HTTP ${response.status}`);
  const json = (await response.json()) as { text?: string };
  const text = json.text ?? "";
  return {
    text,
    language: null,
    structuredExtraction: {
      tasks: [],
      decisions: [],
      ideas: [],
      followUps: [],
      openLoops: [],
      selfReportedMood: null,
      projectReferences: [],
      peopleReferences: [],
    },
  };
}

function parseGeminiTranscription(json: unknown): TranscriptionResult {
  const parts =
    (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content
      ?.parts ?? [];
  const raw = parts.map((p) => p.text ?? "").join("");
  try {
    const parsed = JSON.parse(raw) as {
      transcript?: string;
      language?: string | null;
      tasks?: string[];
      decisions?: string[];
      ideas?: string[];
      followUps?: string[];
      openLoops?: string[];
      selfReportedMood?: string | null;
      projectReferences?: string[];
      peopleReferences?: string[];
    };
    return {
      text: parsed.transcript ?? raw,
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
  } catch {
    return {
      text: raw,
      language: null,
      structuredExtraction: {
        tasks: [],
        decisions: [],
        ideas: [],
        followUps: [],
        openLoops: [],
        selfReportedMood: null,
        projectReferences: [],
        peopleReferences: [],
      },
    };
  }
}
