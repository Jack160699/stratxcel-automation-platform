import { NextResponse, type NextRequest } from "next/server";
import { runSmartWebsiteDiscovery } from "@/lib/audit/v1/smart-discovery";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
import { synthesizeOnboardingBusinessIntelligence } from "@/lib/intelligence/onboarding-business-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/site-discovery/resolve
 * Fast, bounded discovery & business intelligence endpoint.
 * Accepts Website, Google Maps / GBP link, and Industry, and synthesizes a canonical business profile.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      websiteUrl?: unknown;
      googleMapsUrl?: unknown;
      industry?: unknown;
      confirmedSocials?: unknown;
      existingDraft?: unknown;
    };

    const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const googleMapsUrl = typeof body.googleMapsUrl === "string" ? body.googleMapsUrl.trim() : "";
    const industry = typeof body.industry === "string" ? body.industry.trim() : "";
    const confirmedSocials = Array.isArray(body.confirmedSocials) ? body.confirmedSocials : [];
    const existingDraft = typeof body.existingDraft === "object" && body.existingDraft !== null
      ? (body.existingDraft as { businessName?: string; location?: string; whatsapp?: string })
      : null;

    if (!websiteUrl && !googleMapsUrl && !industry) {
      return NextResponse.json(
        { error: "At least one input (website, Google Maps link, or industry) is required." },
        { status: 400 }
      );
    }

    // 1. Process Google Maps / GBP if provided
    let googleMapsData = null;
    if (googleMapsUrl) {
      const gbpNorm = validateAndNormalizeGoogleMapsInput(googleMapsUrl);
      if (gbpNorm.success) {
        googleMapsData = gbpNorm.data;
      }
    }

    // 2. Process Website Crawl if provided
    let websiteResult = null;
    if (websiteUrl) {
      try {
        websiteResult = await runSmartWebsiteDiscovery(websiteUrl);
      } catch {
        // Non-fatal if website fails but GBP/industry is provided
      }
    }

    // 3. Synthesize canonical business intelligence
    const intelligence = synthesizeOnboardingBusinessIntelligence({
      websiteData: websiteResult?.data || null,
      googleMapsData,
      selectedIndustry: industry || websiteResult?.data?.industry || null,
      confirmedSocials: confirmedSocials.length ? confirmedSocials : (websiteResult?.data?.socialLinks?.map((s) => ({
        platform: s.platform,
        url: s.url,
        handle: s.handle,
        confirmed: true,
      })) || []),
      existingDraft,
    });

    const isSuccess = Boolean(websiteResult?.isSuccess || googleMapsData?.placeName || intelligence.business.name !== "My Business");
    const finalState = isSuccess ? "COMPLETE" : "PARTIAL";

    return NextResponse.json(
      {
        operationId: websiteResult?.operationId || `gbp_${Date.now()}`,
        finalState,
        isSuccess,
        isPartial: !isSuccess,
        data: websiteResult?.data || {
          websiteUrl,
          businessName: intelligence.business.name,
          industry: intelligence.business.industry,
          businessModel: intelligence.business.businessModel,
          location: intelligence.business.location,
          services: intelligence.business.services,
          primaryOffer: intelligence.business.primaryOffer,
          socialLinks: websiteResult?.data?.socialLinks || [],
          businessStage: "GROWING",
          routedDeliverable: "BUSINESS_AUDIT",
          ctas: [],
          bookingLinks: [],
          newsletter: false,
          testimonials: [],
          trustBadges: [],
          certifications: [],
          awards: [],
          guarantees: [],
          blogResources: [],
          faqs: [],
          seoSignals: {},
          isReachable: true,
        },
        intelligence,
        events: websiteResult?.events || [],
        startedAt: websiteResult?.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery and business synthesis failed";
    return NextResponse.json(
      {
        operationId: `disc_err_${Date.now()}`,
        finalState: "FAILED",
        isSuccess: false,
        isPartial: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
