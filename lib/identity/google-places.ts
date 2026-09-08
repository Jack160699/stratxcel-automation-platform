/**
 * Google Places API (New) adapter -- real public business/place search and
 * details, server-side only. Live-verified against Google's own current
 * documentation during this build (developers.google.com/maps/documentation/
 * places/web-service/place-autocomplete and .../place-details): the exact
 * request shapes, headers, and response field paths below match what
 * Google's docs describe today, not recalled from training data.
 *
 * Distinct from, and never a substitute for, the existing authenticated
 * Google Business Profile OAuth connector (lib/social/providers/
 * google-business.ts) -- that proves ownership/management access to a
 * specific location; this only proves a public place was found by Google's
 * own search index. See resolveEffectiveGbpVerificationState's own header
 * comment for the same account-vs-location distinction this module respects
 * for "selected" vs "verified".
 *
 * Fails honest, never fabricates: if no API key is configured
 * (GOOGLE_PLACES_API_KEY, falling back to GOOGLE_MAPS_API_KEY -- neither is
 * configured in this codebase as of this build, confirmed by exhaustive
 * grep), every export here returns `available:false` / `ok:false` with an
 * empty result, never a guessed or cached-stale suggestion.
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const FETCH_TIMEOUT_MS = 6_000;

function getPlacesApiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

export function isPlacesSearchAvailable(): boolean {
  return Boolean(getPlacesApiKey());
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface PlaceAutocompleteSuggestion {
  placeId: string;
  place: string; // resource name, e.g. "places/ChIJ..."
  mainText: string;
  secondaryText: string;
  fullText: string;
}

/**
 * POST places:autocomplete -- real business/place suggestions as the
 * customer types. `sessionToken` should be a stable per-search-session UUID
 * the caller generates once and reuses across keystrokes + the eventual
 * Details call, matching Google's session-based Autocomplete billing model
 * (undocumented exactly how much this saves without live billing access,
 * but it's the real, documented mechanism Google provides for this -- never
 * fabricated, just passed through when the caller supplies one).
 */
export async function searchBusinessSuggestions(
  input: string,
  options?: { sessionToken?: string; regionCode?: string }
): Promise<{ available: boolean; suggestions: PlaceAutocompleteSuggestion[]; error?: string }> {
  const trimmed = input.trim();
  if (!trimmed) return { available: true, suggestions: [] };

  const apiKey = getPlacesApiKey();
  if (!apiKey) return { available: false, suggestions: [] };

  try {
    const res = await fetchWithTimeout(`${PLACES_API_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: trimmed,
        includedPrimaryTypes: ["establishment"],
        ...(options?.sessionToken ? { sessionToken: options.sessionToken } : {}),
        ...(options?.regionCode ? { regionCode: options.regionCode } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { available: true, suggestions: [], error: `Places autocomplete failed (${res.status}): ${detail.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          place?: string;
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }>;
    };

    const suggestions: PlaceAutocompleteSuggestion[] = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: p.placeId!,
        place: p.place ?? `places/${p.placeId}`,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        fullText: p.text?.text ?? p.structuredFormat?.mainText?.text ?? "",
      }));

    return { available: true, suggestions };
  } catch (err) {
    return { available: true, suggestions: [], error: err instanceof Error ? err.message : "Business search request failed." };
  }
}

export interface GooglePlaceDetails {
  placeId: string;
  place: string;
  displayName: string | null;
  formattedAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  types: string[];
  category: string | null;
  phone: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  openingHoursWeekdayText: string[] | null;
  photoNames: string[];
}

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "types",
  "nationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "photos",
].join(",");

/** Humanizes Google's raw snake_case place type (e.g. "health_consultant" -> "Health Consultant") -- a best-effort display label, never treated as an authoritative category taxonomy. */
function humanizeType(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const GENERIC_TYPES = new Set(["point_of_interest", "establishment"]);

/**
 * GET places/{placeId} -- real place details. `place` may be either a bare
 * place ID or the full "places/{id}" resource name Autocomplete returns;
 * both are accepted.
 */
export async function getPlaceDetails(place: string): Promise<{ ok: boolean; details?: GooglePlaceDetails; error?: string }> {
  const apiKey = getPlacesApiKey();
  if (!apiKey) return { ok: false, error: "Places API is not configured." };

  const resourcePath = place.startsWith("places/") ? place : `places/${place}`;
  const placeId = resourcePath.replace(/^places\//, "");

  try {
    const res = await fetchWithTimeout(`${PLACES_API_BASE}/${resourcePath}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Place details lookup failed (${res.status}): ${detail.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
      location?: { latitude?: number; longitude?: number };
      types?: string[];
      nationalPhoneNumber?: string;
      websiteUri?: string;
      googleMapsUri?: string;
      rating?: number;
      userRatingCount?: number;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
      photos?: Array<{ name?: string }>;
    };

    const components = data.addressComponents ?? [];
    const findComponent = (type: string) => components.find((c) => c.types?.includes(type))?.longText ?? null;
    const firstSpecificType = (data.types ?? []).find((t) => !GENERIC_TYPES.has(t));

    const details: GooglePlaceDetails = {
      placeId,
      place: resourcePath,
      displayName: data.displayName?.text ?? null,
      formattedAddress: data.formattedAddress ?? null,
      city: findComponent("locality") ?? findComponent("postal_town"),
      state: findComponent("administrative_area_level_1"),
      country: findComponent("country"),
      postalCode: findComponent("postal_code"),
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
      types: data.types ?? [],
      category: humanizeType(firstSpecificType),
      phone: data.nationalPhoneNumber ?? null,
      websiteUri: data.websiteUri ?? null,
      googleMapsUri: data.googleMapsUri ?? null,
      rating: data.rating ?? null,
      userRatingCount: data.userRatingCount ?? null,
      openingHoursWeekdayText: data.regularOpeningHours?.weekdayDescriptions ?? null,
      photoNames: (data.photos ?? []).map((p) => p.name).filter((n): n is string => Boolean(n)),
    };

    return { ok: true, details };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Place details request failed." };
  }
}

/**
 * POST places:searchText -- best-effort resolution of a real placeId from
 * free text (e.g. a business name extracted from a pasted Maps URL that
 * doesn't itself embed a placeId). Returns at most one, best-ranked match;
 * never treated as a confirmed selection the way an explicit Autocomplete
 * selection is -- callers should still show this as a match to confirm,
 * not silently substitute it.
 */
export async function searchPlaceByText(
  query: string,
  options?: { locationHint?: { latitude: number; longitude: number } }
): Promise<{ available: boolean; details?: GooglePlaceDetails; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { available: true };

  const apiKey = getPlacesApiKey();
  if (!apiKey) return { available: false };

  try {
    const res = await fetchWithTimeout(`${PLACES_API_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": `places.${DETAILS_FIELD_MASK.replace(/,/g, ",places.")}`,
      },
      body: JSON.stringify({
        textQuery: trimmed,
        ...(options?.locationHint
          ? {
              locationBias: {
                circle: {
                  center: { latitude: options.locationHint.latitude, longitude: options.locationHint.longitude },
                  radius: 20000,
                },
              },
            }
          : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { available: true, error: `Text search failed (${res.status}): ${detail.slice(0, 300)}` };
    }

    const data = (await res.json()) as { places?: Array<Record<string, unknown>> };
    const first = data.places?.[0];
    if (!first || typeof first.id !== "string") return { available: true };

    // Reuse the exact same shaping logic as getPlaceDetails by re-fetching
    // through it -- keeps one single real parsing path instead of two.
    return getPlaceDetails(first.id).then((r) => ({ available: true, details: r.details, error: r.error }));
  } catch (err) {
    return { available: true, error: err instanceof Error ? err.message : "Text search request failed." };
  }
}
