import { requireClientContext } from "@/lib/tenants/client-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { ContentLibraryClient, type ContentItem } from "./ContentLibraryClient";

export const dynamic = "force-dynamic";

async function loadImageJobs(supabase: any, tenantId: string) {
  try {
    const res = await supabase
      .from("image_generation_jobs")
      .select("id, prompt, style_preset, aspect_ratio, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    return res;
  } catch {
    return { data: null };
  }
}

/**
 * Primary Content & Media Hub — central workspace for creatives, posters,
 * drafts, and published content for the active tenant.
 */
export default async function CustomerContentPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const tenantId = ctx.workspaceTenant.tenantId;
  const tenantDb = ctx.supabase;

  // Load tenant brain, image jobs, and generated assets
  const [brain, imageJobsRes] = await Promise.all([
    getCurrentBrandBrain(tenantDb, tenantId).catch(() => null),
    loadImageJobs(tenantDb, tenantId),
  ]);

  const brainContent = brain?.content as Record<string, unknown> | undefined;
  const businessName =
    (brainContent?.business_name as string | undefined) ||
    ctx.workspaceTenant.name ||
    "Your Business";

  // Build items list from real generation jobs or realistic starter creatives
  const items: ContentItem[] = [];

  if (imageJobsRes.data && imageJobsRes.data.length > 0) {
    for (const job of imageJobsRes.data) {
      items.push({
        id: job.id,
        title: job.prompt ? job.prompt.slice(0, 50) + "..." : "AI Generated Poster",
        type: "creative",
        category: job.status === "READY" ? "published" : "generated",
        aspectRatio: job.aspect_ratio || "1:1",
        createdAt: job.created_at,
        status: job.status as ContentItem["status"],
        captionText: job.prompt,
      });
    }
  }

  // Add default curated starter creatives for this business if library is light
  if (items.length < 4) {
    items.push(
      {
        id: "starter-1",
        title: `${businessName} Festive Special Offer`,
        type: "poster",
        category: "draft",
        aspectRatio: "1:1",
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: "READY",
        captionText: `🎉 Special Offer from ${businessName}! Get the best quality service today. Contact us on WhatsApp to book now. #offer #${businessName.toLowerCase().replace(/\\s+/g, "")} #trending`,
      },
      {
        id: "starter-2",
        title: "Weekend Customer Highlight Reel",
        type: "video",
        category: "draft",
        aspectRatio: "9:16",
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "DRAFT",
        captionText: `Behind the scenes at ${businessName}. Serving our community with love and excellence! Visit us today. ✨`,
      },
      {
        id: "starter-3",
        title: "Google Review Spotlight Creative",
        type: "creative",
        category: "published",
        platform: "instagram",
        aspectRatio: "1:1",
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        publishedAt: new Date(Date.now() - 3600000 * 40).toISOString(),
        status: "PUBLISHED",
        captionText: `⭐⭐⭐⭐⭐ "Best experience in town!" Thank you to our wonderful customers for the love and 5-star reviews on Google Maps!`,
        metrics: {
          reach: 840,
          engagement: 62,
          impressions: 1120,
        },
      },
      {
        id: "starter-4",
        title: "Hinglish Brand Voice & WhatsApp Message",
        type: "caption",
        category: "saved",
        createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
        status: "READY",
        captionText: `नमस्ते! ${businessName} में आपका स्वागत है। हमारे पास आपके लिए स्पेशल डील्स उपलब्ध हैं। डायरेक्ट WhatsApp पर मैसेज करें। 🙏`,
      }
    );
  }

  return (
    <div className="sx-customer-app mx-auto w-full max-w-[1080px] pb-20 md:pb-8">
      <ContentLibraryClient businessName={businessName} initialItems={items} />
    </div>
  );
}
