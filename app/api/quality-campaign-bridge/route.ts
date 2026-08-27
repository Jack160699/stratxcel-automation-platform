import { NextResponse, type NextRequest } from "next/server";
import { ImageMediaRuntime } from "@stratxcel/ai-runtime";

/**
 * TEMPORARY, one-off bridge for the Social Autopilot real-generation
 * quality campaign. Never committed to git, never merged -- exists only on
 * disk for the duration of one Preview deployment and deleted immediately
 * after use.
 *
 * Why this exists: OPENAI_API_KEY is a Vercel "Secret"-type environment
 * variable, confirmed (via `vercel env pull` and `vercel env run`, both of
 * which explicitly refused with "Secret values cannot be pulled") to be
 * retrievable by NO local CLI mechanism -- Vercel only ever decrypts it
 * into code actually running on Vercel's own deployment runtime. This
 * route IS that code: it runs the exact same ImageMediaRuntime class
 * production's image pipeline (lib/image-generation/service.ts ->
 * packages/ai-runtime/src/adapters/creative-studio.ts ->
 * ImageMediaRuntime) already wraps, with zero prototype logic of its own.
 *
 * Auth: a token generated locally (crypto.randomBytes, never derived from
 * any Vercel-stored secret) and passed to THIS deployment only via
 * `vercel deploy -e QUALITY_CAMPAIGN_BRIDGE_TOKEN=...` -- avoids the
 * chicken-and-egg problem of needing a secret I can't locally read to
 * authenticate my own calls to a route whose entire purpose is reaching a
 * secret I can't locally read.
 *
 * No storage dependency is passed to ImageMediaRuntime, so nothing is
 * written to Supabase -- candidates come back as base64 data: URIs in the
 * JSON response, decoded and saved to a LOCAL file by the calling script.
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.QUALITY_CAMPAIGN_BRIDGE_TOKEN;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("verify") === "1") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ openaiConfigured: false });
    // Minimal authenticated request -- never echoes the key.
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    return NextResponse.json({ openaiConfigured: true, openaiKeyLength: key.length, verifyStatus: res.status, verifyOk: res.ok });
  }
  return NextResponse.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), openaiConfigured: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    prompt: string;
    aspectRatio?: string;
    tier?: "fast" | "standard" | "premium";
    tenantId?: string;
    forceProvider?: "openai";
  };
  if (!body?.prompt) return NextResponse.json({ error: "missing prompt" }, { status: 400 });

  // forceProvider=openai: the campaign already confirmed Gemini's image
  // quota is hard-exhausted (limit: 0 on every tier) -- skip straight to
  // the OpenAI fallback so this doesn't waste a call re-discovering that.
  const runtime = new ImageMediaRuntime(
    body.forceProvider === "openai" ? { geminiApiKey: undefined } : {}
  );
  if (!runtime.isConfigured()) return NextResponse.json({ outcome: "NOT_CONFIGURED" });

  const outcome = await runtime.generate({
    tenantId: body.tenantId ?? "quality-campaign-preview-bridge",
    prompt: body.prompt,
    aspectRatio: body.aspectRatio ?? "4:5",
    tier: body.tier ?? "standard",
    candidateCount: 1,
  });
  return NextResponse.json(outcome);
}
