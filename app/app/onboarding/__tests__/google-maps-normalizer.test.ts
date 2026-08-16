import assert from "node:assert/strict";
import { validateAndNormalizeGoogleMapsInput } from "../../../../lib/identity/google-maps-normalizer.ts";

function run() {
  console.log("Running Google Maps / GBP Normalization Tests...");

  // 1. Direct place URL with place name
  {
    const r = validateAndNormalizeGoogleMapsInput("https://www.google.com/maps/place/StratXcel+Solutions/@21.19,81.35,17z/data=!4m6!3m5");
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.placeName, "StratXcel Solutions");
      assert.ok(r.data.canonicalUrl.includes("maps/place/StratXcel+Solutions"));
      assert.equal(r.data.displayHandle, "StratXcel Solutions");
      assert.ok(r.data.latitude !== undefined && r.data.longitude !== undefined);
    }
  }

  // 2. Short share link (maps.app.goo.gl)
  {
    const r = validateAndNormalizeGoogleMapsInput("https://maps.app.goo.gl/9ZpL8qX1k7Vw2M4A6");
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.canonicalUrl, "https://maps.app.goo.gl/9ZpL8qX1k7Vw2M4A6");
      assert.ok(r.data.displayHandle.length > 0);
    }
  }

  // 3. g.page business profile link
  {
    const r = validateAndNormalizeGoogleMapsInput("https://g.page/r/CZx890abcdef/review");
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.canonicalUrl, "https://g.page/r/CZx890abcdef/review");
    }
  }

  // 4. Place search link
  {
    const r = validateAndNormalizeGoogleMapsInput("https://www.google.com/maps/search/Artisan+Bakery+Bhilai");
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.placeName, "Artisan Bakery Bhilai");
    }
  }

  // 5. Invalid input guard
  {
    const r1 = validateAndNormalizeGoogleMapsInput("");
    assert.equal(r1.success, false);

    const r2 = validateAndNormalizeGoogleMapsInput("https://randomunrelatedsite.com");
    assert.equal(r2.success, false);
  }

  console.log("google-maps-normalizer.test.ts: ALL PASS");
}

run();
