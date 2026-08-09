import { NextResponse } from "next/server";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { requireOwnerContext, getServiceContext } from "@/lib/owner-brain/db-context";
import { getSourceByKey, upsertConnection } from "@/lib/owner-brain/repositories/sources";
import { verifyNotionToken } from "@/lib/owner-brain/connectors/notion";

/**
 * POST /api/admin/operating-brain/connectors/notion/connect
 * Body: { token: string } — a Notion internal-integration secret, typed
 * once into the admin UI's own secure field over this authenticated
 * HTTPS request (never pasted into chat, never logged). Verified against
 * Notion's own API before being vaulted, so a typo never silently marks
 * the source CONNECTED.
 */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const valid = await verifyNotionToken(token);
  if (!valid) return NextResponse.json({ error: "Notion rejected this token — check it was copied correctly" }, { status: 400 });

  const source = await getSourceByKey(ctx, "notion");
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });

  const vault = createDevEncryptedVault(getServiceContext().supabase);
  const ref = await vault.store(token);
  await upsertConnection({ ownerId: ctx.ownerId, sourceId: source.id, encryptedTokenRef: ref, scopes: ["read_content"] });

  return NextResponse.json({ connected: true });
}

export const dynamic = "force-dynamic";
