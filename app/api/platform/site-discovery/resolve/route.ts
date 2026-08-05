import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPrivateIP(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
  if (host.startsWith("172.")) {
    const parts = host.split(".");
    if (parts.length >= 2) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
  }
  return false;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    let rawInput = (body.url ?? "").trim();

    if (!rawInput) {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    if (!/^https?:\/\//i.test(rawInput)) {
      rawInput = `https://${rawInput}`;
    }

    const parsed = new URL(rawInput);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return Response.json({ error: "Invalid protocol. Only http and https allowed." }, { status: 400 });
    }

    if (isPrivateIP(parsed.hostname)) {
      return Response.json({ error: "Private or internal URLs are restricted for security." }, { status: 400 });
    }

    const normalizedUrl = parsed.origin;

    return Response.json({
      ok: true,
      rawInput,
      normalizedUrl,
      hostname: parsed.hostname,
      verification_status: "not_checked",
      verification_note: "URL normalized cleanly. Remote site fetch disabled for security (not_checked).",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to resolve website";
    return Response.json({ error: msg }, { status: 400 });
  }
}
