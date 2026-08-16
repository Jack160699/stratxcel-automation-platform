/**
 * Google Maps / Google Business Profile (GBP) Input Normalizer & Metadata Extractor
 *
 * Accepts diverse customer inputs:
 * - https://maps.app.goo.gl/abcdef123
 * - https://goo.gl/maps/abcdef123
 * - https://www.google.com/maps/place/Business+Name/@lat,lng,zoom/data=...
 * - https://www.google.com/maps/search/Business+Name/@lat,lng,...
 * - https://g.page/r/abcdef123
 * - https://business.google.com/...
 * - https://search.google.com/local/writereview?placeid=...
 * - https://www.google.com/maps?cid=1234567890
 */

export interface NormalizedGoogleMapsInput {
  rawInput: string;
  canonicalUrl: string;
  placeName?: string;
  cid?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  displayHandle: string;
}

export function validateAndNormalizeGoogleMapsInput(
  rawInput: string
): { success: true; data: NormalizedGoogleMapsInput } | { success: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { success: false, error: "Please enter a Google Maps or Google Business Profile link." };
  }

  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();

    const isGoogleDomain =
      host.includes("google.") ||
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "g.page" ||
      host.includes("google.com");

    if (!isGoogleDomain && !trimmed.includes("maps") && !trimmed.includes("place")) {
      return { success: false, error: "Enter a valid Google Maps, Google Business Profile, or share link." };
    }

    let placeName: string | undefined;
    let cid: string | undefined;
    let placeId: string | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;

    // 1. Check pathname for /maps/place/Business+Name/
    if (parsed.pathname.includes("/maps/place/")) {
      const parts = parsed.pathname.split("/maps/place/")[1]?.split("/");
      if (parts && parts[0]) {
        placeName = decodeURIComponent(parts[0].replace(/\+/g, " "));
      }
    } else if (parsed.pathname.includes("/maps/search/")) {
      const parts = parsed.pathname.split("/maps/search/")[1]?.split("/");
      if (parts && parts[0]) {
        placeName = decodeURIComponent(parts[0].replace(/\+/g, " "));
      }
    } else if (host === "g.page" || parsed.pathname.startsWith("/r/")) {
      const slug = parsed.pathname.replace(/^\/r\/|^\//, "").split(/[/?#]/)[0];
      if (slug) {
        placeName = decodeURIComponent(slug.replace(/[-_]/g, " "));
      }
    }

    // 2. Extract CID or PlaceID from search params
    const cidParam = parsed.searchParams.get("cid");
    if (cidParam) cid = cidParam;

    const placeIdParam = parsed.searchParams.get("placeid") || parsed.searchParams.get("place_id");
    if (placeIdParam) placeId = placeIdParam;

    // 3. Extract Lat/Lng if present in URL (@lat,lng,zoom)
    const latLngMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(parsed.pathname + parsed.search);
    if (latLngMatch && latLngMatch[1] && latLngMatch[2]) {
      latitude = parseFloat(latLngMatch[1]);
      longitude = parseFloat(latLngMatch[2]);
    }

    // Clean up place name if it looks like coords or raw query
    if (placeName && /^@?-?\d+\.\d+,-?\d+\.\d+/.test(placeName)) {
      placeName = undefined;
    }

    const displayHandle = placeName || (host === "maps.app.goo.gl" ? "Google Maps Place" : parsed.hostname);

    return {
      success: true,
      data: {
        rawInput: trimmed,
        canonicalUrl: parsed.href,
        placeName,
        cid,
        placeId,
        latitude,
        longitude,
        displayHandle,
      },
    };
  } catch {
    return { success: false, error: "Enter a valid Google Maps or Google Business Profile link." };
  }
}
