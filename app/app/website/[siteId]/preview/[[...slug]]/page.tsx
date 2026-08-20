import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PreviewClientWrapper } from "../PreviewClientWrapper";
import { browserQARunner } from "@stratxcel/websites-and-domains";
import type { SitePage } from "@stratxcel/websites-and-domains";

export const dynamic = "force-dynamic";

export default async function SitePreviewPage({
  params,
}: {
  params: Promise<{ siteId: string; slug?: string[] }>;
}) {
  const { siteId, slug } = await params;
  const requestedSlug = slug?.[0] ?? "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: site } = await supabase
    .from("site_projects")
    .select("*")
    .eq("id", siteId)
    .maybeSingle();

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
  const version = site.version || 1;

  // Run browser QA evaluation for preview
  const qaResult = await browserQARunner.runFullBrowserQA({
    projectId: siteId,
    tenantId: site.tenant_id,
    version,
    previewUrl: `https://preview.stratxcel.in/project/${siteId}?version=${version}`,
    siteModel: {
      name: site.name,
      pages,
    },
    hasEcommerce: site.website_type === "ECOMMERCE",
    hasAiAgent: (site.website_agents?.length || 0) > 0,
  });

  return (
    <PreviewClientWrapper
      siteId={siteId}
      siteName={site.name}
      version={version}
      pages={pages}
      activePage={activePage}
      basePath={basePath}
      qaResult={qaResult}
    />
  );
}
