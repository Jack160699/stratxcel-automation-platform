import { NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isValidArchetype } from "@/lib/social/archetype-registry";
import { renderArchetypePreview } from "@/lib/social/archetype-preview";

/**
 * Serves one archetype's real, locally-rendered 1080x1080 preview PNG for
 * the Spotify-style onboarding gallery and the manual "choose a visual
 * style" picker (Subscription-Gated Visual Archetypes brief Section 12).
 * Renders on every request with the actual production renderer -- no AI
 * provider call, no stored/generated-in-advance screenshot that could
 * drift from what production draws. Gated behind an authenticated
 * platform session (not tenant-scoped -- every preview uses the same
 * fixture content regardless of who's viewing) purely to keep this off
 * the public internet as an anonymous rendering endpoint.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ archetype: string }> }) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: 401 });

  const { archetype } = await context.params;
  if (!isValidArchetype(archetype)) {
    return NextResponse.json({ error: "Unknown archetype" }, { status: 404 });
  }

  const png = await renderArchetypePreview(archetype);
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
