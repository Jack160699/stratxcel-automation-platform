import { notFound } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { SitePageView, SiteNav, SiteFooter } from "@/components/site-builder/SiteRenderer";
import type { SitePage } from "@stratxcel/websites-and-domains";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface SiteRouteParams {
  params: Promise<{ domain: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: SiteRouteParams): Promise<Metadata> {
  const { domain, slug } = await params;
  const requestedSlug = slug?.join("/") ?? "";

  const serviceDb = createSupabaseServiceClient();
  const { data: site } = await serviceDb
    .from("site_projects")
    .select("name, pages, custom_domain")
    .or(`custom_domain.eq.${domain},slug.eq.${domain}`)
    .maybeSingle();

  if (!site) return { title: domain };

  const pages = (site.pages ?? []) as SitePage[];
  const activePage = pages.find((p) => p.slug === requestedSlug) ?? pages[0];

  return {
    title: activePage?.seo?.title || `${site.name} — Official Website`,
    description: activePage?.seo?.metaDescription || `Official website of ${site.name}`,
  };
}

export default async function PublicLiveSitePage({ params }: SiteRouteParams) {
  const { domain, slug } = await params;
  const requestedSlug = slug?.join("/") ?? "";

  const serviceDb = createSupabaseServiceClient();

  // Lookup by custom_domain or slug
  const { data: site } = await serviceDb
    .from("site_projects")
    .select("*")
    .or(`custom_domain.eq.${domain},slug.eq.${domain},preview_subdomain.eq.${domain}`)
    .maybeSingle();

  if (!site) notFound();

  const pages = (site.pages ?? []) as SitePage[];
  const activePage = pages.find((p) => p.slug === requestedSlug) ?? pages[0];

  if (!activePage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-sm text-sx-text-subtle">
        Website is being prepared.
      </div>
    );
  }

  const basePath = `/site/${domain}`;

  return (
    <div className="min-h-screen bg-sx-bg text-sx-text">
      <SiteNav pages={pages} activeSlug={activePage.slug} basePath={basePath} />
      <main>
        <SitePageView page={activePage} />
      </main>
      <SiteFooter siteName={site.name} />
    </div>
  );
}
