import { requireClientContext } from "@/lib/tenants/client-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { ContentLibraryClient, type ContentItem } from "./ContentLibraryClient";

export const dynamic = "force-dynamic";

function generatePosterSvg(title: string, subtitle: string, accentColor = "#2563eb", badge = "SPECIAL OFFER") {
  const safeTitle = title.replace(/[<>&"]/g, "");
  const safeSubtitle = subtitle.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="60%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#090d16"/>
      </linearGradient>
      <linearGradient id="accentGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accentColor}"/>
        <stop offset="100%" stop-color="#3b82f6"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#bg)"/>
    <circle cx="500" cy="100" r="180" fill="${accentColor}" opacity="0.12" filter="blur(40px)"/>
    <circle cx="100" cy="500" r="160" fill="#3b82f6" opacity="0.1" filter="blur(40px)"/>
    <rect x="30" y="30" width="540" height="540" rx="20" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <rect x="50" y="60" width="140" height="32" rx="16" fill="url(#accentGlow)"/>
    <text x="120" y="81" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" letter-spacing="1.5">${badge}</text>
    <text x="50" y="240" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="bold" width="500">
      <tspan x="50" dy="0">${safeTitle.slice(0, 26)}</tspan>
      <tspan x="50" dy="48">${safeTitle.slice(26, 52)}</tspan>
    </text>
    <text x="50" y="360" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="18">
      <tspan x="50" dy="0">${safeSubtitle.slice(0, 42)}</tspan>
      <tspan x="50" dy="28">${safeSubtitle.slice(42, 84)}</tspan>
    </text>
    <rect x="50" y="470" width="220" height="48" rx="24" fill="#ffffff"/>
    <text x="160" y="500" fill="#0f172a" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">Book on WhatsApp →</text>
    <text x="550" y="510" fill="#64748b" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" text-anchor="end">StratXcel AutoCreative</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function loadTenantMedia(supabase: any, tenantId: string) {
  try {
    const { data: assets } = await supabase
      .from("social_media_assets")
      .select("id, original_name, mime_type, storage_bucket, storage_path, created_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "READY")
      .order("created_at", { ascending: false })
      .limit(15);

    if (!assets || assets.length === 0) return [];

    const items: Array<{ id: string; name: string; url: string; mimeType: string; createdAt: string }> = [];
    for (const a of assets) {
      try {
        const { data: signed } = await supabase.storage.from(a.storage_bucket).createSignedUrl(a.storage_path, 3600);
        if (signed?.signedUrl) {
          items.push({
            id: a.id,
            name: a.original_name || "Media Asset",
            url: signed.signedUrl,
            mimeType: a.mime_type || "image/jpeg",
            createdAt: a.created_at,
          });
        }
      } catch {
        // storage sign error ignored
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function loadImageJobs(supabase: any, tenantId: string) {
  try {
    const res = await supabase
      .from("image_generation_jobs")
      .select("id, prompt, style_preset, aspect_ratio, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(15);
    return res?.data ?? [];
  } catch {
    return [];
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

  // Load tenant brain, image jobs, and stored media assets in parallel
  const [brain, mediaAssets, imageJobs] = await Promise.all([
    getCurrentBrandBrain(tenantDb, tenantId).catch(() => null),
    loadTenantMedia(tenantDb, tenantId),
    loadImageJobs(tenantDb, tenantId),
  ]);

  const brainContent = brain?.content as Record<string, unknown> | undefined;
  const businessName =
    (brainContent?.business_name as string | undefined) ||
    ctx.workspaceTenant.name ||
    "Your Business";

  const items: ContentItem[] = [];

  // 1. Add real uploaded/generated media assets with signed URLs
  for (const media of mediaAssets) {
    items.push({
      id: media.id,
      title: media.name,
      type: media.mimeType.startsWith("video/") ? "video" : "creative",
      category: "saved",
      imageUrl: media.url,
      aspectRatio: "1:1",
      createdAt: media.createdAt,
      status: "READY",
      captionText: `${media.name} — Asset saved in Brand Library.`,
    });
  }

  // 2. Add AI generation jobs with visual preview posters
  for (const job of imageJobs) {
    const posterUrl = generatePosterSvg(
      job.prompt ? job.prompt.slice(0, 45) : "AI Generated Promotion",
      `Created for ${businessName}`,
      "#6366f1",
      job.status === "READY" ? "GENERATED" : "IN PROGRESS"
    );

    items.push({
      id: job.id,
      title: job.prompt ? job.prompt.slice(0, 50) + "..." : "AI Generated Creative",
      type: "poster",
      category: job.status === "READY" ? "published" : "generated",
      imageUrl: posterUrl,
      aspectRatio: job.aspect_ratio || "1:1",
      createdAt: job.created_at,
      status: job.status as ContentItem["status"],
      captionText: job.prompt,
    });
  }

  // 3. Add starter curated creatives with rich high-res visual posters if needed
  if (items.length < 5) {
    items.push(
      {
        id: "starter-festive",
        title: `${businessName} Festive Special Offer`,
        type: "poster",
        category: "draft",
        angle: "Festive / Special Offer",
        objective: "Festive footfall & direct WhatsApp orders",
        imageUrl: generatePosterSvg(
          `${businessName} Special Celebration Offer`,
          "Exclusive deals and top quality service. Order on WhatsApp today!",
          "#f59e0b",
          "FESTIVE DEALS"
        ),
        aspectRatio: "1:1",
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: "READY",
        captionText: `🎉 Exclusive Offer from ${businessName}! Get premium quality today. Direct message on WhatsApp to reserve. #specialoffer #${businessName.toLowerCase().replace(/\\s+/g, "")} #trending`,
      },
      {
        // Found live during E2E testing: this example item claimed
        // category: "published" / status: "PUBLISHED" with a publishedAt
        // timestamp and fabricated metrics (reach 840 / engagement 62 /
        // impressions 1120) -- for a brand-new tenant with zero rows in
        // content_master, i.e. nothing was ever actually published or
        // measured. A real customer's very first visit to their Content
        // page would see what looks like a live Instagram post already
        // getting real engagement. These "starter curated creatives" are a
        // reasonable onboarding pattern (example ideas to seed the empty
        // state), but must never claim a real business outcome that never
        // happened -- kept as an unpublished, unmeasured example like the
        // other three starter items below.
        id: "starter-review",
        title: "Google 5-Star Review Spotlight",
        type: "creative",
        category: "draft",
        angle: "5-Star Review Spotlight",
        objective: "Customer trust & Google Maps review proof",
        imageUrl: generatePosterSvg(
          `⭐⭐⭐⭐⭐ "Best Experience in Town!"`,
          `Thank you to all our customers for rating ${businessName} 5-stars on Google Maps!`,
          "#10b981",
          "5-STAR RATED"
        ),
        aspectRatio: "1:1",
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        status: "READY",
        captionText: `⭐⭐⭐⭐⭐ "Best experience in town!" Thank you to our wonderful customers for the love and 5-star reviews on Google Maps!`,
      },
      {
        id: "starter-reel",
        title: "Behind the Scenes Highlight Reel",
        type: "video",
        category: "draft",
        angle: "Behind the Scenes",
        objective: "Community engagement & craft transparency",
        imageUrl: generatePosterSvg(
          `Behind the Scenes at ${businessName}`,
          "Watch our team prepare fresh orders with care and passion. Tap to play.",
          "#ec4899",
          "VIDEO REEL"
        ),
        aspectRatio: "9:16",
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "DRAFT",
        captionText: `Behind the scenes at ${businessName}. Serving our community with love and excellence! Visit us today. ✨`,
      },
      {
        id: "starter-caption",
        title: "Hinglish Brand Voice & WhatsApp Invite",
        type: "caption",
        category: "saved",
        angle: "Local & Friendly",
        objective: "Multilingual neighborhood outreach",
        createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
        status: "READY",
        captionText: `नमस्ते! ${businessName} में आपका स्वागत है। हमारे पास आपके लिए स्पेशल डील्स उपलब्ध हैं। डायरेक्ट WhatsApp पर मैसेज करें और बेस्ट रेट्स पाएं। 🙏`,
      }
    );
  }

  return (
    <div className="sx-customer-app mx-auto w-full max-w-[1080px] pb-20 md:pb-8">
      <ContentLibraryClient businessName={businessName} initialItems={items} />
    </div>
  );
}
