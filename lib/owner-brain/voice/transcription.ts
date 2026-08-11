import { routeVoiceWorkload, assertVoiceRouteSafe, createTenantAIRuntime, resolveModelId } from "@stratxcel/ai-runtime";
import { GEMINI_MODEL } from "../../social/agent/gemini-boundary.ts";

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

const STRUCTURED_FROM_TRANSCRIPT = `Extract structured signal from this voice-note transcript.
Respond with ONLY a JSON object, no markdown fences:
{"language": string|null, "tasks": string[], "decisions": string[], "ideas": string[], "followUps": string[], "openLoops": string[], "selfReportedMood": string|null, "projectReferences": string[], "peopleReferences": string[]}
Leave arrays empty when nothing of that kind is present. Do not invent content not in the transcript.

Transcript:
`;

/**
 * Prefer OpenAI transcription + cheap AI Runtime structured extraction.
 * Falls back to Gemini multimodal when only GEMINI_API_KEY is set.
 * Never sends permanent API keys to the browser.
 */
export async function transcribeVoiceNote(
  audioBase64: string,
  mimeType: string,
  opts?: { tenantId?: string },
): Promise<TranscriptionResult> {
  const route = routeVoiceWorkload("transcription");
  assertVoiceRouteSafe(route);

  if (process.env.OPENAI_API_KEY) {
    const transcript = await transcribeWithOpenAI(audioBase64, mimeType, route.primaryModel);
    const structured = await extractStructuredFromTranscript(transcript.text, opts?.tenantId);
    return {
      text: transcript.text,
      language: structured.language ?? transcript.language,
      structuredExtraction: structured.structuredExtraction,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No transcription provider configured (OPENAI_API_KEY or GEMINI_API_KEY)");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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

async function transcribeWithOpenAI(
  audioBase64: string,
  mimeType: string,
  model: string,
): Promise<{ text: string; language: string | null }> {
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
  const json = (await response.json()) as { text?: string; language?: string };
  return { text: json.text ?? "", language: json.language ?? null };
}

async function extractStructuredFromTranscript(
  transcript: string,
  tenantId?: string,
): Promise<Pick<TranscriptionResult, "language" | "structuredExtraction">> {
  const empty = {
    language: null as string | null,
    structuredExtraction: {
      tasks: [] as string[],
      decisions: [] as string[],
      ideas: [] as string[],
      followUps: [] as string[],
      openLoops: [] as string[],
      selfReportedMood: null as string | null,
      projectReferences: [] as string[],
      peopleReferences: [] as string[],
    },
  };
  if (!transcript.trim()) return empty;

  // Cheap extraction via AI Runtime ROUTING policy (Flash-Lite / nano).
  // Agency/internal transcription without tenant uses a non-billable local parse fallback.
  if (!tenantId) {
    return localHeuristicExtraction(transcript);
  }

  try {
    const { createSupabaseServiceClient } = await import("@/lib/supabase/service");
    let internalWriteClient: ReturnType<typeof createSupabaseServiceClient>;
    try {
      internalWriteClient = createSupabaseServiceClient();
    } catch {
      return localHeuristicExtraction(transcript);
    }
    const { runtime } = createTenantAIRuntime({
      tenantId,
      plan: "starter",
      spentUsdThisMonth: 0,
      productionBillable: true,
      internalWriteClient: internalWriteClient as never,
    });
    const result = await runtime.execute({
      tenantId,
      department: "operations",
      taskClass: "ROUTING",
      messages: [
        { role: "system", content: "You extract structured facts from transcripts. Never invent." },
        { role: "user", content: STRUCTURED_FROM_TRANSCRIPT + transcript },
      ],
      structuredOutputSchema: {
        type: "object",
        properties: {
          language: { type: ["string", "null"] },
          tasks: { type: "array", items: { type: "string" } },
          decisions: { type: "array", items: { type: "string" } },
          ideas: { type: "array", items: { type: "string" } },
          followUps: { type: "array", items: { type: "string" } },
          openLoops: { type: "array", items: { type: "string" } },
          selfReportedMood: { type: ["string", "null"] },
          projectReferences: { type: "array", items: { type: "string" } },
          peopleReferences: { type: "array", items: { type: "string" } },
        },
        required: [
          "tasks",
          "decisions",
          "ideas",
          "followUps",
          "openLoops",
          "projectReferences",
          "peopleReferences",
        ],
      },
    });
    if (!result.ok) return localHeuristicExtraction(transcript);
    const parsed =
      (result.structuredOutput as Record<string, unknown> | undefined) ??
      (() => {
        try {
          return JSON.parse(result.text) as Record<string, unknown>;
        } catch {
          return null;
        }
      })();
    if (!parsed) return localHeuristicExtraction(transcript);
    return {
      language: typeof parsed.language === "string" ? parsed.language : null,
      structuredExtraction: {
        tasks: asStringArray(parsed.tasks),
        decisions: asStringArray(parsed.decisions),
        ideas: asStringArray(parsed.ideas),
        followUps: asStringArray(parsed.followUps),
        openLoops: asStringArray(parsed.openLoops),
        selfReportedMood: typeof parsed.selfReportedMood === "string" ? parsed.selfReportedMood : null,
        projectReferences: asStringArray(parsed.projectReferences),
        peopleReferences: asStringArray(parsed.peopleReferences),
      },
    };
  } catch {
    return localHeuristicExtraction(transcript);
  }
}

function localHeuristicExtraction(transcript: string): Pick<TranscriptionResult, "language" | "structuredExtraction"> {
  const lines = transcript.split(/[.!?\n]+/).map((l) => l.trim()).filter(Boolean);
  const tasks = lines.filter((l) => /\b(need to|todo|task|must|should)\b/i.test(l)).slice(0, 5);
  const ideas = lines.filter((l) => /\b(idea|maybe|what if|could)\b/i.test(l)).slice(0, 5);
  const decisions = lines.filter((l) => /\b(decided|decision|will go with|chose)\b/i.test(l)).slice(0, 5);
  const followUps = lines.filter((l) => /\b(follow up|next|later|remind)\b/i.test(l)).slice(0, 5);
  return {
    language: null,
    structuredExtraction: {
      tasks,
      decisions,
      ideas,
      followUps,
      openLoops: [],
      selfReportedMood: null,
      projectReferences: [],
      peopleReferences: [],
    },
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
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

void resolveModelId;
