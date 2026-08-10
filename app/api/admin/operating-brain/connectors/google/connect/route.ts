import { NextResponse, type NextRequest } from "next/server";
import { requireOperatingBrainApiAccess } from "@/lib/release/operating-brain-api";
import { buildGoogleAuthorizeUrl } from "@/lib/owner-brain/connectors/google-oauth";
import { generateOwnerBrainOAuthState } from "@/lib/owner-brain/connectors/oauth-state";
import { connectorEnvReady } from "@/lib/owner-brain/sources/registry";
import type { SourceKey } from "@/lib/owner-brain/types";

const GOOGLE_SOURCES: SourceKey[] = ["gmail", "google_calendar", "google_drive"];

/** GET /api/admin/operating-brain/connectors/google/connect?source=gmail|google_calendar|google_drive — redirects to Google's consent screen. Requires an active owner session (never callable unauthenticated). */
export async function GET(request: NextRequest) {
  const access = await requireOperatingBrainApiAccess();
  if (!access.ok) return access.response;
  const ctx = access.ctx;

  const sourceKey = request.nextUrl.searchParams.get("source") as SourceKey | null;
  if (!sourceKey || !GOOGLE_SOURCES.includes(sourceKey)) {
    return NextResponse.json({ error: "source must be one of gmail, google_calendar, google_drive" }, { status: 400 });
  }
  if (!connectorEnvReady(sourceKey)) {
    return NextResponse.json({ error: "GOOGLE_OWNER_BRAIN_CLIENT_ID/SECRET are not configured" }, { status: 503 });
  }

  const state = generateOwnerBrainOAuthState({ ownerId: ctx.ownerId, sourceKey });
  const redirectUri = new URL("/api/admin/operating-brain/connectors/google/callback", request.url).toString();
  const authorizeUrl = buildGoogleAuthorizeUrl({ state, redirectUri, sourceKey });
  return NextResponse.redirect(authorizeUrl);
}

export const dynamic = "force-dynamic";
