import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchBusinessSuggestions } from "@/lib/identity/google-places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/onboarding/business-search/suggest?q=...&sessionToken=...
 *
 * Real Google Places (New) Autocomplete, server-side only -- the API key
 * never reaches the browser (mission Section 21). Authenticated (real,
 * billed Google API calls per request) but genuinely pre-tenant: this runs
 * during onboarding, before a tenant exists.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const sessionToken = req.nextUrl.searchParams.get("sessionToken") ?? undefined;
  const trimmed = q.trim();

  // Cheap floor -- a 1-2 character query returns noisy, expensive-to-bill
  // suggestions with no real value; let the client debounce the rest.
  if (trimmed.length < 3) {
    return NextResponse.json({ available: true, suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const result = await searchBusinessSuggestions(trimmed, { sessionToken, regionCode: "IN" });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
