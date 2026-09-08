import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runSmartWebsiteDiscovery } from "@/lib/audit/v1/smart-discovery";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
import { getPlaceDetails, type GooglePlaceDetails } from "@/lib/identity/google-places";
import { synthesizeOnboardingBusinessIntelligence } from "@/lib/intelligence/onboarding-business-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/site-discovery/resolve
 * Fast, bounded discovery & business intelligence endpoint.
 * Accepts Website, Google Maps / GBP link, a real Google Place ID (from
 * the search-first Business Discovery flow), and Industry, and synthesizes
 * a canonical business profile.
 *
 * `googlePlaceId` is the STRATXCEL BUSINESS DISCOVERY redesign's search-
 * select path -- deliberately routed through this SAME endpoint rather
 * than a second one, so the pasted-Maps-link path and the search-and-
 * select path converge into one real pipeline, never two (mission Section
 * 12). When Google reports a website for the selected place, that website
 * is automatically analyzed too (Section 6) -- reusing the exact same
 * runSmartWebsiteDiscovery call the website-only path already uses, never
 * a second crawler.
 */
export async function POST(req: NextRequest) {
  // Real, billed Google Places calls can now happen on this path -- this
  // route was previously safe to leave open (only a bounded website crawl,
  // no external cost per call); it is not anymore. Require a signed-in
  // user, same as every other onboarding endpoint (e.g. whatsapp/send-otp),
  // even though onboarding itself is still pre-tenant at this point.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      websiteUrl?: unknown;
      googleMapsUrl?: unknown;
      googlePlaceId?: unknown;
      industry?: unknown;
      confirmedSocials?: unknown;
      existingDraft?: unknown;
    };

    let websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const googleMapsUrl = typeof body.googleMapsUrl === "string" ? body.googleMapsUrl.trim() : "";
    const googlePlaceId = typeof body.googlePlaceId === "string" ? body.googlePlaceId.trim() : "";
    const industry = typeof body.industry === "string" ? body.industry.trim() : "";
    const confirmedSocials = Array.isArray(body.confirmedSocials) ? body.confirmedSocials : [];
    const existingDraft = typeof body.existingDraft === "object" && body.existingDraft !== null
      ? (body.existingDraft as { businessName?: string; location?: string; whatsapp?: string })
      : null;

    if (!websiteUrl && !googleMapsUrl && !googlePlaceId && !industry) {
      return NextResponse.json(
        { error: "At least one input (website, Google Maps link, Google place, or industry) is required." },
        { status: 400 }
      );
    }

    // 1a. Resolve a real, selected Google Place -- never a guess: only ever
    // the actual Places API response for the ID the customer selected (or,
    // rarely, for one that was later re-resolved from a pasted URL's own
    // extracted placeId -- same lookup either way).
    let googlePlaceData: GooglePlaceDetails | null = null;
    let placeError: string | undefined;
    if (googlePlaceId) {
      const placeResult = await getPlaceDetails(googlePlaceId);
      if (placeResult.ok && placeResult.details) {
        googlePlaceData = placeResult.details;
        // Auto-discover the website Google itself reports for this place
        // (Section 6) -- only when the caller didn't already supply one.
        if (!websiteUrl && googlePlaceData.websiteUri) {
          websiteUrl = googlePlaceData.websiteUri;
        }
      } else {
        placeError = placeResult.error;
      }
    }

    // 1b. Process a pasted Google Maps / GBP link if provided
    let googleMapsData = null;
    if (googleMapsUrl) {
      const gbpNorm = validateAndNormalizeGoogleMapsInput(googleMapsUrl);
      if (gbpNorm.success) {
        googleMapsData = gbpNorm.data;
      }
    }

    // 2. Process Website Crawl if provided (customer-typed, or just
    // auto-discovered from the selected Google place above)
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
      googlePlaceData,
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
        // Real, raw Places data for the "Business selected" confirmation
        // card (rating/review count/etc. that never fit the business/brand
        // synthesis shape above) -- null when no place was selected/found,
        // never a fabricated placeholder.
        googlePlace: googlePlaceData,
        googlePlaceError: googlePlaceId && !googlePlaceData ? placeError ?? "Could not find this Google business." : undefined,
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
