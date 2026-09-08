// Run with: node --experimental-strip-types lib/identity/__tests__/google-places.test.ts
import assert from "node:assert/strict";
import { searchBusinessSuggestions, getPlaceDetails, searchPlaceByText, isPlacesSearchAvailable } from "../google-places.ts";

console.log("Running StratXcel Google Places Adapter Test Suite...\n");

async function run() {
  // --- 1. No API key configured -- must fail honest, never fabricate. -----
  {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.equal(isPlacesSearchAvailable(), false);

    const suggestResult = await searchBusinessSuggestions("medroute");
    assert.equal(suggestResult.available, false, "must report unavailable, not silently return zero results as if the search ran");
    assert.deepEqual(suggestResult.suggestions, []);

    const detailsResult = await getPlaceDetails("some_place_id");
    assert.equal(detailsResult.ok, false);
    assert.ok(detailsResult.error);

    const textResult = await searchPlaceByText("MedRoute Consultancy Raipur");
    assert.equal(textResult.available, false);

    console.log("✓ Test 1: honestly reports unavailable with no API key configured -- never fabricates a suggestion or place");
  }

  // --- 2. Autocomplete: real request shape, real response parsing. --------
  {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;
    globalThis.fetch = (async (url: string, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                place: "places/ChIJ_test_medroute",
                placeId: "ChIJ_test_medroute",
                text: { text: "MedRoute Consultancy, Raipur, Chhattisgarh" },
                structuredFormat: {
                  mainText: { text: "MedRoute Consultancy" },
                  secondaryText: { text: "Raipur, Chhattisgarh" },
                },
              },
            },
            // A malformed entry (no placeId) must be dropped, not crash the parse.
            { placePrediction: { text: { text: "malformed, no id" } } },
          ],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await searchBusinessSuggestions("medroute", { sessionToken: "sess-1", regionCode: "IN" });
    assert.equal(result.available, true);
    assert.equal(capturedUrl, "https://places.googleapis.com/v1/places:autocomplete");
    assert.equal(capturedHeaders["X-Goog-Api-Key"], "test-places-key");
    assert.equal(capturedBody.input, "medroute");
    assert.equal(capturedBody.sessionToken, "sess-1");
    assert.equal(capturedBody.regionCode, "IN");
    assert.equal(result.suggestions.length, 1, "the malformed entry with no placeId must be dropped, not crash or fabricate an id");
    assert.equal(result.suggestions[0]!.placeId, "ChIJ_test_medroute");
    assert.equal(result.suggestions[0]!.mainText, "MedRoute Consultancy");
    assert.equal(result.suggestions[0]!.secondaryText, "Raipur, Chhattisgarh");

    console.log("✓ Test 2: autocomplete calls the real endpoint with the real header/body shape and parses suggestions correctly");
  }

  // --- 3. Place Details: real request shape, real field extraction. -------
  {
    let capturedUrl = "";
    let capturedFieldMask = "";
    globalThis.fetch = (async (url: string, init: any) => {
      capturedUrl = String(url);
      capturedFieldMask = init.headers["X-Goog-FieldMask"];
      return {
        ok: true,
        json: async () => ({
          id: "ChIJ_test_medroute",
          displayName: { text: "MedRoute Consultancy" },
          formattedAddress: "123 Main Rd, Raipur, Chhattisgarh 492001, India",
          addressComponents: [
            { longText: "Raipur", shortText: "Raipur", types: ["locality"] },
            { longText: "Chhattisgarh", shortText: "CG", types: ["administrative_area_level_1"] },
            { longText: "India", shortText: "IN", types: ["country"] },
            { longText: "492001", shortText: "492001", types: ["postal_code"] },
          ],
          location: { latitude: 21.25, longitude: 81.63 },
          types: ["health_consultant", "point_of_interest", "establishment"],
          nationalPhoneNumber: "098765 43210",
          websiteUri: "https://www.medrouteconsultancy.com",
          googleMapsUri: "https://maps.google.com/?cid=12345",
          rating: 4.6,
          userRatingCount: 128,
          regularOpeningHours: { weekdayDescriptions: ["Monday: 9 AM to 6 PM"] },
          photos: [{ name: "places/ChIJ_test_medroute/photos/abc" }, {}],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await getPlaceDetails("ChIJ_test_medroute");
    assert.equal(result.ok, true);
    assert.equal(capturedUrl, "https://places.googleapis.com/v1/places/ChIJ_test_medroute");
    assert.ok(capturedFieldMask.includes("addressComponents") && capturedFieldMask.includes("regularOpeningHours"));

    const d = result.details!;
    assert.equal(d.displayName, "MedRoute Consultancy");
    assert.equal(d.city, "Raipur");
    assert.equal(d.state, "Chhattisgarh");
    assert.equal(d.country, "India");
    assert.equal(d.postalCode, "492001");
    assert.equal(d.phone, "098765 43210");
    assert.equal(d.websiteUri, "https://www.medrouteconsultancy.com");
    assert.equal(d.rating, 4.6);
    assert.equal(d.userRatingCount, 128);
    assert.equal(d.category, "Health Consultant", "must skip the generic point_of_interest/establishment types and humanize the specific one");
    assert.deepEqual(d.openingHoursWeekdayText, ["Monday: 9 AM to 6 PM"]);
    assert.deepEqual(d.photoNames, ["places/ChIJ_test_medroute/photos/abc"], "a photo entry with no name must be dropped, never fabricated");

    // Accepts a full "places/{id}" resource name too, not just a bare id.
    const result2 = await getPlaceDetails("places/ChIJ_test_medroute");
    assert.equal(result2.ok, true);
    assert.equal(capturedUrl, "https://places.googleapis.com/v1/places/ChIJ_test_medroute");

    console.log("✓ Test 3: place details calls the real endpoint and extracts every real field correctly, including address-component parsing");
  }

  // --- 4. Non-ok HTTP response -- honest error, never a fabricated result.
  {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => "API key not authorized for this API",
    })) as unknown as typeof fetch;

    const suggestResult = await searchBusinessSuggestions("medroute");
    assert.equal(suggestResult.available, true, "the search capability itself is available (key configured); this specific call failed");
    assert.deepEqual(suggestResult.suggestions, []);
    assert.ok(suggestResult.error?.includes("403"));

    const detailsResult = await getPlaceDetails("bad_id");
    assert.equal(detailsResult.ok, false);
    assert.ok(detailsResult.error?.includes("403"));

    console.log("✓ Test 4: a real provider error surfaces honestly, never silently swallowed into an empty-but-successful result");
  }

  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
}

await run();

console.log("\n===============================================");
console.log("ALL GOOGLE PLACES ADAPTER TESTS PASSED!");
console.log("===============================================");
