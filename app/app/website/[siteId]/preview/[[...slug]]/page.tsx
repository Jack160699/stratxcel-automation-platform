import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SitePageView, SiteNav, SiteFooter } from "@/components/site-builder/SiteRenderer";
import type { SitePage } from "@stratxcel/websites-and-domains";

export const dynamic = "force-dynamic";

/**
 * The real, working preview — reachable at
 * /app/website/{siteId}/preview[/{pageSlug}] on the already-live
 * www.stratxcel.in domain, so it needs no new DNS/wildcard-domain setup to
 * be genuinely viewable before any domain purchase. Renders the site's
 * *current* version (draft/in-revision content included) so the customer
 * always sees what they're actually about to approve — never the last
 * approved version once a newer draft exists.
 *
 * Uses the authenticated-session client, not service-role — tenant
 * isolation here comes from site_projects' own RLS policy
 * (site_projects_tenant_read), the same "/app is 100% authenticated-session
 * reads" rule every other client page follows. A site belonging to a
 * tenant the caller isn't a member of simply doesn't come back — no manual
 * membership re-check needed or wanted here.
 */
export default async function SitePreviewPage({ params }: { params: Promise<{ siteId: string; slug?: string[] }> }) {
  const { siteId, slug } = await params;
  const requestedSlug = slug?.[0] ?? "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: site } = await supabase.from("site_projects").select("*").eq("id", siteId).maybeSingle();
  if (!site) notFound();

  const pages = (site.pages ?? []) as SitePage[];
  const activePage = pages.find((p) => p.slug === requestedSlug) ?? pages[0];
  if (!activePage) {
    return (
      <div className="p-8 text-center text-sm text-sx-text-subtle">
        This site has no generated content yet.
      </div>
    );
  }

  const basePath = `/app/website/${siteId}/preview`;

  return (
    <div className="min-h-screen bg-sx-bg">
      <div className="border-b border-sx-border bg-sx-surface-2 px-4 py-2 text-center text-xs text-sx-text-subtle">
        Preview — status: <span className="font-semibold">{site.status}</span>
        {site.status !== "live" && " — not yet approved for production"}
      </div>
      <SiteNav pages={pages} activeSlug={activePage.slug} basePath={basePath} />
      <SitePageView page={activePage} />
      <SiteFooter siteName={site.name} />
    </div>
  );
}
