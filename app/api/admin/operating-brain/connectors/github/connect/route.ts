import { NextResponse } from "next/server";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { requireOwnerContext, getServiceContext } from "@/lib/owner-brain/db-context";
import { getSourceByKey, upsertConnection } from "@/lib/owner-brain/repositories/sources";
import { verifyGitHubToken } from "@/lib/owner-brain/connectors/github";

/**
 * POST /api/admin/operating-brain/connectors/github/connect
 * Body: { token: string } — a GitHub fine-grained personal access token,
 * scoped by the owner to read-only "Contents", "Pull requests", "Issues"
 * permissions on whichever repos they choose at
 * github.com/settings/personal-access-tokens/new. Deliberately a PAT
 * flow rather than a classic OAuth App: GitHub's classic OAuth "repo"
 * scope is full read+write on every private repo the account can see —
 * there is no read-only equivalent — so a scoped, read-only fine-grained
 * PAT is the actual least-privilege option here, same reasoning as the
 * Notion connector's integration-secret flow.
 */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const valid = await verifyGitHubToken(token);
  if (!valid) return NextResponse.json({ error: "GitHub rejected this token — check it was copied correctly and hasn't expired" }, { status: 400 });

  const source = await getSourceByKey(ctx, "github");
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });

  const vault = createDevEncryptedVault(getServiceContext().supabase);
  const ref = await vault.store(token);
  await upsertConnection({ ownerId: ctx.ownerId, sourceId: source.id, encryptedTokenRef: ref, scopes: ["contents:read", "pull_requests:read", "issues:read"] });

  return NextResponse.json({ connected: true });
}

export const dynamic = "force-dynamic";
