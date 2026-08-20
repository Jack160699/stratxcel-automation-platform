"use client";

import { useState } from "react";
import { CustomerPreviewToolbar } from "@/components/site-builder/CustomerPreviewToolbar";
import { SitePageView, SiteNav, SiteFooter } from "@/components/site-builder/SiteRenderer";
import type { SitePage, BrowserQAResult } from "@stratxcel/websites-and-domains";
import { useRouter } from "next/navigation";

interface PreviewClientWrapperProps {
  siteId: string;
  siteName: string;
  version: number;
  pages: SitePage[];
  activePage: SitePage;
  basePath: string;
  qaResult?: BrowserQAResult;
}

export function PreviewClientWrapper({
  siteId,
  siteName,
  version,
  pages,
  activePage,
  basePath,
  qaResult,
}: PreviewClientWrapperProps) {
  const router = useRouter();
  const [viewport, setViewport] = useState<"375px" | "768px" | "1024px" | "1440px">("1440px");
  const [isPublishing, setIsPublishing] = useState(false);

  const containerMaxWidth =
    viewport === "375px"
      ? "max-w-[375px]"
      : viewport === "768px"
      ? "max-w-[768px]"
      : viewport === "1024px"
      ? "max-w-[1024px]"
      : "w-full";

  async function handlePublish() {
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/platform/website-factory/${siteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (res.ok) {
        router.push("/app/website");
      }
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col">
      {/* Customer Preview Toolbar */}
      <CustomerPreviewToolbar
        projectName={siteName}
        version={version}
        qaResult={qaResult}
        viewport={viewport}
        onChangeViewport={setViewport}
        onPublish={handlePublish}
        isPublishing={isPublishing}
      />

      {/* Frame Container */}
      <div className="flex-1 p-2 md:p-6 flex justify-center items-start overflow-x-auto">
        <div
          className={`${containerMaxWidth} w-full transition-all duration-300 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-sx-bg`}
        >
          <SiteNav pages={pages} activeSlug={activePage.slug} basePath={basePath} />
          <SitePageView page={activePage} />
          <SiteFooter siteName={siteName} />
        </div>
      </div>
    </div>
  );
}
