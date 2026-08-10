import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { isBetaModeEnabled } from "@/lib/release/release-mode";

/**
 * Public technical architecture pages (/agents, /system) are V2 preview
 * surfaces. Stable visitors are redirected to a V1 marketing page.
 * Owner-admin + Beta may continue to the page body.
 *
 * Fail closed: any auth/env/cookie failure redirects to Stable V1 content
 * rather than throwing a 500 or leaking the technical page.
 */
export async function gatePublicTechnicalPage(stableRedirect = "/how-it-works"): Promise<void> {
  try {
    // Without Supabase env, owner-admin preview is impossible — Stable redirect.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      redirect(stableRedirect);
    }
    const beta = await isBetaModeEnabled();
    if (!beta) redirect(stableRedirect);
    const ctx = await requireOwnerContext();
    if (!ctx.ok) redirect(stableRedirect);
  } catch (err) {
    // NEXT_REDIRECT must propagate — Next uses a thrown digest for redirects.
    if (err && typeof err === "object" && "digest" in err) {
      const digest = String((err as { digest?: unknown }).digest ?? "");
      if (digest.startsWith("NEXT_REDIRECT")) throw err;
    }
    redirect(stableRedirect);
  }
}
