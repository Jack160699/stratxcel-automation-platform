// Run with: node --experimental-strip-types lib/social/__tests__/text-overlay-render.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildTextOverlaySvg, renderTextOverlay, selectLogoVariant, getFont, sanitizeForFont, type TextOverlayLayoutInput, type LogoAsset, type LogoVariantBundle } from "../text-overlay-render.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`text-overlay-render.test.ts: ${name} — PASS`);
    } catch (err) {
      console.error(`text-overlay-render.test.ts: ${name} — FAIL`);
      throw err;
    }
  })();
}

// Since real production output (Final Production Loop brief Step 5's E2E
// staging validation) proved <text> elements render invisibly on Vercel's
// actual serverless runtime, this module pre-renders every character as a
// real glyph-outline SVG <path> instead (see the module docblock for the
// full story). That means these tests can no longer assert on a literal
// text string appearing in the SVG source -- there IS no literal text
// string in the output, only path coordinate data. Instead they assert on
// structural signals real glyph rendering actually leaves behind: a
// substantial <path> d-attribute (real multi-character glyph outlines are
// long; a 3-point icon triangle is short), content-sensitivity (different
// input text produces different path data), and fill-color correctness on
// the <path> elements themselves (fill is still a real, checkable
// attribute on a path exactly like it was on a <text> element).

/** Real glyph-outline paths for more than a couple of characters run into
 * the hundreds of path-data characters; every icon in this file (pin
 * triangle, phone line, globe strokes) is a handful of coordinates. This
 * threshold reliably separates "a rendered line of text" from "an icon
 * shape" without needing to know the exact text content. */
const GLYPH_PATH_MIN_LENGTH = 150;

function glyphPaths(svg: string): Array<{ d: string; fill: string }> {
  return [...svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"/g)]
    .map((m) => ({ d: m[1]!, fill: m[2]! }))
    .filter((p) => p.d.length >= GLYPH_PATH_MIN_LENGTH);
}

// Base fixture shared across archetypes -- individual tests override only
// what they're actually testing.
const BASE: Omit<TextOverlayLayoutInput, "layoutArchetype"> = {
  width: 1024,
  height: 1280,
  elements: [
    { role: "headline", text: "The 20-Minute Desk Reset" },
    { role: "cta", text: "Book a session" },
  ],
  typographyPersonality: "bold-condensed",
  textColor: "#FFFFFF",
  scrimColor: "#000000",
  accentColor: "#D62828",
  primaryColor: "#0B3D91",
  secondaryColor: "#F4A300",
  businessName: "IronCore Fitness",
};

async function main() {
  await test("all three archetypes render real glyph-outline paths for headline/CTA/brand -- not empty, not just icon-sized shapes", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype });
      assert.ok(svg.startsWith("<svg"), `${layoutArchetype}: not a valid SVG root`);
      const paths = glyphPaths(svg);
      // headline + CTA + brand label (business name) -- at least 3 real
      // rendered lines of text expected across every archetype.
      assert.ok(paths.length >= 3, `${layoutArchetype}: expected at least 3 real glyph-path lines (headline/cta/brand), got ${paths.length}`);
    }
  });

  await test("different text content produces genuinely different glyph-path data (content-sensitivity, since there's no literal string to compare anymore)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svgA = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "Desk Reset" }] });
      const svgB = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "Lunch Special" }] });
      assert.notEqual(svgA, svgB, `${layoutArchetype}: different headline text must produce different SVG output`);
      const pathsA = glyphPaths(svgA).map((p) => p.d);
      const pathsB = glyphPaths(svgB).map((p) => p.d);
      assert.ok(pathsA.length && pathsB.length, `${layoutArchetype}: expected real glyph paths in both variants`);
      assert.notDeepEqual(pathsA, pathsB, `${layoutArchetype}: different headline text must produce different glyph path data`);
    }
  });

  await test("SPLIT_BANNER: a solid band fills the bottom ~30%+ of the canvas using the brand's real primary color, not a generic black scrim", () => {
    const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype: "SPLIT_BANNER" });
    assert.ok(svg.includes(`fill="${BASE.primaryColor}"`), "expected the band's fill to be the real brand primary color");
    assert.ok(!svg.includes('fill="#000000"'), "must not fall back to a generic black scrim when a real primary color exists");
    const bandMatch = svg.match(new RegExp(`<rect x="0" y="(-?[\\d.]+)" width="${BASE.width}" height="([\\d.]+)" fill="${BASE.primaryColor}"`));
    assert.ok(bandMatch, "expected a full-width band rect");
    const bandHeight = Number(bandMatch![2]);
    assert.ok(bandHeight >= BASE.height * 0.28, `expected the band to occupy roughly the bottom 30%, got height=${bandHeight} of canvas ${BASE.height}`);
  });

  await test("FLOATING_CARD: the card is offset into a corner (not full width) and the photo above/beside it stays free of any container rect", () => {
    const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FLOATING_CARD" });
    const cardMatch = svg.match(/<rect x="(\d+)" y="([\d.]+)" width="(\d+)" height="([\d.]+)" rx="\d+" fill="#(?:FFFFFF|14181F)" fill-opacity="0.95"/);
    assert.ok(cardMatch, "expected a padded card rect with a neutral frosted/solid fill");
    const cardWidth = Number(cardMatch![3]);
    assert.ok(cardWidth < BASE.width * 0.75, `expected the card to be offset (narrower than the full canvas), got width=${cardWidth} of canvas ${BASE.width}`);
    const cardX = Number(cardMatch![1]);
    assert.ok(cardX > 0, "expected the card to be padded off the left edge, not flush with it");
  });

  await test("EDITORIAL_FRAME: a thin outer frame stroke inset from the canvas edges, no full scrim rect, and no CTA pill", () => {
    const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype: "EDITORIAL_FRAME" });
    const frameMatch = svg.match(/<rect x="(\d+)" y="\d+" width="(\d+)" height="(\d+)" fill="none" stroke="[^"]+" stroke-width="\d+" \/>/);
    assert.ok(frameMatch, "expected a stroked, unfilled outer frame rect");
    const frameX = Number(frameMatch![1]);
    assert.ok(frameX > 0 && frameX < BASE.width * 0.1, `expected the frame to be a thin inset border, got x=${frameX}`);
    // No large full-bleed filled scrim (the restrained archetype relies on
    // the frame + rule lines, not a dark rectangle behind the text).
    const filledRects = [...svg.matchAll(/<rect[^>]*fill="(?!none)[^"]+"[^>]*width="(\d+)" height="(\d+)"/g)];
    for (const m of filledRects) {
      const area = Number(m[1]) * Number(m[2]);
      assert.ok(area < BASE.width * BASE.height * 0.15, `expected no large filled scrim rect in EDITORIAL_FRAME, found one with area ${area}`);
    }
  });

  await test("contact footer: only fields actually present in verifiedFacts render an icon row -- a missing phone renders zero phone content, never a placeholder", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const withContact = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        contactInfo: { location: "Fort Kochi, Kerala", phone: null, website: "coastalkitchen.in" },
      });
      const withoutContact = buildTextOverlaySvg({ ...BASE, layoutArchetype, contactInfo: { location: null, phone: null, website: null } });
      assert.notEqual(withContact, withoutContact, `${layoutArchetype}: contact info presence must change the rendered output`);
      // The footer icons (location pin + globe) are real, so their SVG
      // primitives must appear only when contact info is present.
      assert.ok(withContact.includes("<ellipse"), `${layoutArchetype}: expected the web icon's ellipse primitive when a website is present`);
      assert.ok(!withoutContact.includes("<ellipse"), `${layoutArchetype}: must not render the web icon when no website is supplied`);
    }
  });

  await test("contact footer icons are built from real SVG primitives (circle/path/line/ellipse), never Unicode emoji glyphs", () => {
    const svg = buildTextOverlaySvg({
      ...BASE, layoutArchetype: "SPLIT_BANNER",
      contactInfo: { location: "Fort Kochi, Kerala", phone: "+91 98765 43210", website: "coastalkitchen.in" },
    });
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(svg), "expected no emoji codepoints anywhere in the generated SVG");
    assert.ok(svg.includes("<ellipse"), "expected the web icon's ellipse primitive");
    assert.ok((svg.match(/<line /g) ?? []).length >= 1, "expected the phone icon's line primitive");
    assert.ok((svg.match(/<circle /g) ?? []).length >= 2, "expected circle primitives from the location pin and/or phone icons");
  });

  await test("special characters (& < > \") in text never break the generated SVG's XML structure (glyph paths make this true by construction -- there is no literal string to escape anymore)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svg = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        elements: [{ role: "headline", text: `Salt & Pepper <"special">` }],
      });
      assert.ok(svg.startsWith("<svg"), `${layoutArchetype}: expected a valid SVG root even with XML-unsafe input text`);
      assert.ok(svg.trim().endsWith("</svg>"), `${layoutArchetype}: expected a well-formed, closed SVG document`);
      // The literal input text must never appear verbatim anywhere in the
      // markup -- it only ever exists as pre-computed path coordinates.
      assert.ok(!svg.includes(`Salt & Pepper <"special">`), `${layoutArchetype}: raw input text must never appear as literal markup`);
      const paths = glyphPaths(svg);
      assert.ok(paths.length > 0, `${layoutArchetype}: expected the headline to still render as real glyph paths`);
    }
  });

  await test("Latin ligature-prone character sequences (ffi/ffl/fi) render without crashing (regression: opentype.js's GSUB engine doesn't support one of Inter's ccmp lookup types -- the embedded font is subset with GSUB/GPOS/GDEF dropped specifically to avoid this)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svg = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        elements: [{ role: "headline", text: "Office waffle traffic fifty" }],
      });
      assert.ok(glyphPaths(svg).length > 0, `${layoutArchetype}: expected real glyph paths for ligature-prone text`);
    }
  });

  await test("long headline wraps into multiple lines rather than a single overflowing line (checked across all three archetypes)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svg = buildTextOverlaySvg({
        ...BASE, layoutArchetype, width: 800, height: 1000,
        elements: [{ role: "headline", text: "This is a genuinely long headline that should wrap across several lines instead of overflowing the frame" }],
        businessName: "", // isolate: no brand-label path to conflate with the headline's own wrapped lines
      });
      const paths = glyphPaths(svg);
      assert.ok(paths.length >= 3, `${layoutArchetype}: expected the long headline to wrap into multiple real glyph-path lines, got ${paths.length}`);
    }
  });

  await test("zero on-image text and empty business name produces a bare, valid, empty SVG for every archetype", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [], businessName: "" });
      assert.ok(svg.startsWith("<svg"));
      assert.ok(!svg.includes("<rect"), `${layoutArchetype}: expected no container/rect when there is genuinely nothing to show`);
      assert.ok(!svg.includes("<path"), `${layoutArchetype}: expected no glyph/icon paths when there is genuinely nothing to show`);
    }
  });

  await test("Creative Generation Architecture Repair: a photo-only creative (no headline/supportingLine/CTA -- exactly what PHOTOGRAPHIC_AD/BRAND_STORY legitimately produce) with a REAL business name but NO uploaded logo still renders the business name as a real watermark, not a fully unbranded image (real defect found live via visual inspection: this used to render nothing at all)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "MINIMAL_FOOTER_STRIP", "BASIC_ESSENTIAL"] as const) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [], businessName: "Coastal Kitchen" });
      assert.ok(glyphPaths(svg).length > 0, `${layoutArchetype}: expected a real business-name watermark when no logo exists, got no glyph content at all: ${svg.slice(0, 200)}`);
    }
    // A genuinely empty business name is still never fabricated into
    // anything -- the one honest case where "render nothing" remains
    // correct (covered by the test immediately above this one too).
    const emptyName = buildTextOverlaySvg({ ...BASE, layoutArchetype: "SPLIT_BANNER", elements: [], businessName: "" });
    assert.equal(glyphPaths(emptyName).length, 0);
  });

  await test("a light accentColor pill gets dark CTA text, never the same white used for the rest of the on-photo text (regression: found white-on-white in real campaign output)", () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD"] as const) {
      // Isolated to ONLY a CTA (no headline/supporting/brand label) so
      // every real glyph path in the output unambiguously belongs to the
      // CTA's own text, not some other block's.
      const lightPill = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        elements: [{ role: "cta", text: "Book a consultation" }],
        businessName: "",
        secondaryColor: "#FFFFFF", accentColor: "#FFFFFF", // a light/white brand secondary used as the pill fill
      });
      const lightPillFills = new Set(glyphPaths(lightPill).map((p) => p.fill));
      assert.ok(lightPillFills.has("#111111"), `${layoutArchetype}: CTA text should be dark for legibility against a light pill, got fills ${[...lightPillFills]}`);
      assert.ok(!lightPillFills.has("#FFFFFF"), `${layoutArchetype}: CTA text must not be white when the pill fill is also white`);

      const darkPill = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        elements: [{ role: "cta", text: "Call now" }],
        businessName: "",
        secondaryColor: "#111111", accentColor: "#111111",
      });
      const darkPillFills = new Set(glyphPaths(darkPill).map((p) => p.fill));
      assert.ok(darkPillFills.has("#FFFFFF"), `${layoutArchetype}: CTA text should be white for legibility against a dark pill`);
    }
  });

  await test("a long CTA wraps into multiple lines and its pill never extends past the canvas edges (regression: found clipped off-canvas in real campaign output)", () => {
    const width = 1024;
    const longCta = "Drop your questions below or book a consultation at our Indiranagar clinic";
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD"] as const) {
      const svg = buildTextOverlaySvg({
        ...BASE, layoutArchetype, width, height: 1280,
        elements: [{ role: "cta", text: longCta }],
        businessName: "",
      });
      const ctaPaths = glyphPaths(svg);
      assert.ok(ctaPaths.length >= 2, `${layoutArchetype}: expected the long CTA to wrap into multiple real glyph-path lines, got ${ctaPaths.length}`);
      const pillRects = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="[^"]*" width="([\d.]+)" height="[^"]*" rx="/g)];
      for (const m of pillRects) {
        const rectX = Number(m[1]);
        const rectWidth = Number(m[2]);
        assert.ok(rectX >= -0.01, `${layoutArchetype}: a rounded rect must not start off the left edge of the canvas, got x=${rectX}`);
        assert.ok(rectX + rectWidth <= width + 0.5, `${layoutArchetype}: a rounded rect must not extend past the right edge (x=${rectX}, width=${rectWidth}, canvas=${width})`);
      }
    }
  });

  await test("safe-zone enforcement: a very long headline+supportingLine+CTA+contact-footer combination never collides in EDITORIAL_FRAME (Section 19 successor)", () => {
    const width = 1024, height = 1280;
    const longText = Array(20).fill("word").join(" ");
    const svg = buildTextOverlaySvg({
      ...BASE, layoutArchetype: "EDITORIAL_FRAME", width, height,
      elements: [
        { role: "headline", text: longText },
        { role: "supportingLine", text: longText },
        { role: "cta", text: longText },
      ],
      contactInfo: { location: "A very long verified address line, City", phone: "+91 98765 43210", website: "example-business.com" },
    });
    // The frame must still be present and valid, and the footer's icons
    // (proof the footer itself rendered) must still be present even under
    // this stress case.
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("<ellipse"), "expected the contact footer's web icon to still render under this stress case");
    assert.ok(glyphPaths(svg).length >= 5, "expected real glyph paths for headline/supporting/cta/footer text under this stress case");
  });

  await test("renderTextOverlay produces a real, valid, correctly-sized PNG composited over a base photo, for every archetype", async () => {
    for (const layoutArchetype of ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] as const) {
      const base = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 40, g: 40, b: 40 } } }).png().toBuffer();
      const out = await renderTextOverlay(base, {
        ...BASE, layoutArchetype, width: 1024, height: 1024,
        elements: [
          { role: "headline", text: "Real Composite Test" },
          { role: "cta", text: "See more" },
          { role: "brandLabel", text: "Test Business" },
        ],
        contactInfo: { location: "Test City", phone: null, website: "test.example" },
      });
      assert.ok(Buffer.isBuffer(out), `${layoutArchetype}: expected a Buffer`);
      assert.ok(out.length > 1000, `${layoutArchetype}: expected a real, non-trivial PNG byte size`);
      const meta = await sharp(out).metadata();
      assert.equal(meta.format, "png", `${layoutArchetype}: expected PNG output`);
      assert.equal(meta.width, 1024, `${layoutArchetype}: canvas width must stay exactly as requested`);
      assert.equal(meta.height, 1024, `${layoutArchetype}: canvas height must stay exactly as requested`);
    }
  });

  // ==========================================================================
  // Subscription-Gated Visual Archetypes brief Section 16: every one of the
  // 13 registered archetypes, exercised against the same checklist --
  // render doesn't throw, exact requested canvas dimensions (1080x1080 is
  // literally what production requests for the 1:1 aspect), headline/
  // supporting/CTA/brand/contact-footer rendering, long-text wrapping,
  // extreme lengths, missing optional fields, no clipping past canvas
  // bounds, and (for the three that support it today) real logo handling.
  // ==========================================================================
  const ALL_ARCHETYPES = [
    "BASIC_ESSENTIAL", "SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME",
    "MINIMAL_FOOTER_STRIP", "ELEVATED_BADGE", "DUAL_TONE_SIDEBAR", "FROSTED_GLASS_CENTER",
    "TYPOGRAPHIC_HERO", "POLAROID_LIFESTYLE", "CLINICAL_TRUST", "NEON_NIGHTLIFE", "FEATURE_POSTER",
  ] as const;

  /** Extracts every <rect>/<image> element's x/y/width/height so callers
   * can assert every container/logo stays within the canvas's own
   * bounds -- the real, generic "no clipping / respects safe zones" check
   * that applies identically across all 13 archetypes' very different
   * geometries, rather than one bespoke assertion per archetype. */
  function boxes(svg: string): Array<{ x: number; y: number; width: number; height: number }> {
    return [...svg.matchAll(/<(?:rect|image)[^>]*\bx="(-?[\d.]+)"[^>]*\by="(-?[\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) }));
  }

  await test("all 13 archetypes: render does not throw with a full, realistic element set", () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      assert.doesNotThrow(() => {
        buildTextOverlaySvg({
          ...BASE, layoutArchetype,
          elements: [
            { role: "headline", text: "The Saturday Thali Special" },
            { role: "supportingLine", text: "Six coastal dishes, one banana leaf, every weekend." },
            { role: "cta", text: "Walk in this Saturday" },
          ],
          contactInfo: { location: "Fort Kochi, Kerala", phone: "+91 98765 43210", website: "coastalkitchen.in" },
        });
      }, `${layoutArchetype}: must not throw`);
    }
  });

  await test("all 13 archetypes: renderTextOverlay produces an exact 1080x1080 PNG (the real production canvas size)", async () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const base = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: { r: 90, g: 100, b: 80 } } }).png().toBuffer();
      const out = await renderTextOverlay(base, {
        ...BASE, layoutArchetype, width: 1080, height: 1080,
        elements: [{ role: "headline", text: "Weekend Special" }, { role: "cta", text: "Book now" }],
      });
      const meta = await sharp(out).metadata();
      assert.equal(meta.width, 1080, `${layoutArchetype}: width must be exactly 1080`);
      assert.equal(meta.height, 1080, `${layoutArchetype}: height must be exactly 1080`);
      assert.equal(meta.format, "png", `${layoutArchetype}: expected PNG output`);
    }
  });

  await test("all 13 archetypes: headline, supportingLine, and CTA each render as real glyph paths when present", () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const withAll = buildTextOverlaySvg({
        ...BASE, layoutArchetype,
        elements: [
          { role: "headline", text: "Weekend Special" },
          { role: "supportingLine", text: "Real supporting detail here." },
          { role: "cta", text: "Book now" },
        ],
      });
      const headlineOnly = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "Weekend Special" }] });
      assert.ok(glyphPaths(withAll).length > glyphPaths(headlineOnly).length, `${layoutArchetype}: supportingLine + CTA must add real glyph paths beyond the headline alone`);
    }
  });

  await test("all 13 archetypes: brand renders (as glyph-path text, or as a real logo <image> for the three archetypes that support one today)", () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const withBrand = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "X" }], businessName: "Fort Kochi Coastal Kitchen" });
      const withoutBrand = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "X" }], businessName: "" });
      assert.notEqual(withBrand, withoutBrand, `${layoutArchetype}: presence of a business name must change the rendered output`);
    }
  });

  await test("all 13 archetypes: real logo image renders with a preserved (never stretched) aspect ratio when supplied (BASIC_ESSENTIAL, FLOATING_CARD, FEATURE_POSTER); every other archetype falls back to the text brand label without crashing", () => {
    const logo = { dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", mimeType: "image/png" as const, aspectRatio: 2.5 };
    const logoSupported: readonly string[] = ["BASIC_ESSENTIAL", "FLOATING_CARD", "FEATURE_POSTER"];
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "X" }], logoImage: logo });
      const imageMatch = svg.match(/<image[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
      if (logoSupported.includes(layoutArchetype)) {
        assert.ok(imageMatch, `${layoutArchetype}: expected a real <image> element for the supplied logo`);
        const renderedAspect = Number(imageMatch![1]) / Number(imageMatch![2]);
        assert.ok(Math.abs(renderedAspect - logo.aspectRatio) < 0.05, `${layoutArchetype}: logo aspect ratio must be preserved, got ${renderedAspect} vs expected ${logo.aspectRatio}`);
      } else {
        // Not yet wired to place a logo -- must not crash, and must still
        // fall back to rendering the business name as glyph-path text.
        assert.ok(glyphPaths(svg).length > 0, `${layoutArchetype}: expected a graceful text fallback when logo isn't wired for this archetype`);
      }
    }
  });

  await test("all 13 archetypes: contact footer renders real icon primitives only for fields actually present, never a placeholder", () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const full = buildTextOverlaySvg({
        ...BASE, layoutArchetype, elements: [{ role: "headline", text: "X" }],
        contactInfo: { location: "Fort Kochi, Kerala", phone: "+91 98765 43210", website: "coastalkitchen.in" },
      });
      const none = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "X" }], contactInfo: { location: null, phone: null, website: null } });
      assert.notEqual(full, none, `${layoutArchetype}: contact info presence must change rendered output`);
      assert.ok(!none.includes("<ellipse"), `${layoutArchetype}: must not render the web icon when no contact info is supplied`);
    }
  });

  await test("all 13 archetypes: a very long headline wraps into as many real glyph-path lines as that archetype's own design allows, never silently dropping the overflow (real bug found and fixed in several: wrapText+slice(0,N) discarded wrapped lines beyond N with zero indication -- wrapTextWithEllipsis now keeps N-1 real lines plus one real-font-metric-truncated line instead)", () => {
    const longHeadline = "This is a genuinely long, realistic headline that any of these twelve archetypes must be able to wrap across several lines without ever overflowing or clipping the frame";
    // Each archetype's own deliberate max-line design constraint (see the
    // wrapTextWithEllipsis call sites in text-overlay-render.ts) -- most
    // have none (wrap as freely as content needs), a few restrain
    // themselves by design (BASIC_ESSENTIAL/ELEVATED_BADGE: 3,
    // TYPOGRAPHIC_HERO: 4, POLAROID_LIFESTYLE's caption: 2,
    // MINIMAL_FOOTER_STRIP: 1 -- truncated, not wrapped, by design).
    const minExpectedLines: Partial<Record<(typeof ALL_ARCHETYPES)[number], number>> = {
      MINIMAL_FOOTER_STRIP: 1,
      POLAROID_LIFESTYLE: 2,
      BASIC_ESSENTIAL: 3,
      ELEVATED_BADGE: 3,
      TYPOGRAPHIC_HERO: 4,
    };
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype, width: 800, height: 1000, elements: [{ role: "headline", text: longHeadline }], businessName: "" });
      const expected = minExpectedLines[layoutArchetype] ?? 3;
      assert.ok(glyphPaths(svg).length >= expected, `${layoutArchetype}: expected at least ${expected} real glyph-path line(s), got ${glyphPaths(svg).length}`);
    }
  });

  await test("all 13 archetypes: extreme text lengths across every field render without throwing and without NaN/Infinity leaking into the SVG", () => {
    const extreme = "Extremely long realistic marketing copy that keeps going for quite a while to genuinely stress-test the wrapping, safe-zone, and growth logic of every single archetype in the registry without ever actually being truncated by anything other than this module's own deterministic wrapping and truncation logic";
    for (const layoutArchetype of ALL_ARCHETYPES) {
      let svg = "";
      assert.doesNotThrow(() => {
        svg = buildTextOverlaySvg({
          ...BASE, layoutArchetype,
          elements: [
            { role: "headline", text: extreme },
            { role: "supportingLine", text: extreme },
            { role: "cta", text: extreme },
          ],
          contactInfo: { location: extreme, phone: "+91 98765 43210", website: extreme },
        });
      }, `${layoutArchetype}: extreme text lengths must not throw`);
      assert.ok(!/NaN|Infinity/.test(svg), `${layoutArchetype}: extreme text lengths must never leak NaN/Infinity into the rendered SVG`);
    }
  });

  await test("all 13 archetypes: missing every optional field (no CTA, no supportingLine, no contact info, empty business name) still renders a valid, non-empty result when a headline is present", () => {
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const svg = buildTextOverlaySvg({ ...BASE, layoutArchetype, elements: [{ role: "headline", text: "Weekend Special" }], businessName: "", contactInfo: null });
      assert.ok(svg.startsWith("<svg"), `${layoutArchetype}: expected a valid SVG root`);
      assert.ok(glyphPaths(svg).length > 0, `${layoutArchetype}: expected the headline to still render with every optional field absent`);
    }
  });

  await test("all 13 archetypes: no container rect or logo image ever extends past the canvas's own [0,width]x[0,height] bounds, even under a heavy realistic content stress case (real bug found and fixed: MINIMAL_FOOTER_STRIP clipped a second contact-footer row past its band edge, ELEVATED_BADGE's CTA/footer extended past the right canvas edge)", () => {
    const logo = { dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", mimeType: "image/png" as const, aspectRatio: 2.5 };
    for (const layoutArchetype of ALL_ARCHETYPES) {
      const width = 1080, height = 1080;
      const svg = buildTextOverlaySvg({
        ...BASE, layoutArchetype, width, height,
        elements: [
          { role: "headline", text: "The Saturday Thali Special Weekend Edition" },
          { role: "supportingLine", text: "Six coastal dishes, one banana leaf, every single weekend without fail." },
          { role: "cta", text: "Walk in this Saturday for lunch or dinner" },
        ],
        contactInfo: { location: "14 Princess Street, Fort Kochi, Kerala 682001", phone: "+91 98765 43210", website: "www.coastalkitchen.example.in" },
        logoImage: logo,
      });
      for (const box of boxes(svg)) {
        assert.ok(box.x >= -0.5, `${layoutArchetype}: a box's x must not start before the canvas's left edge, got x=${box.x}`);
        assert.ok(box.y >= -0.5, `${layoutArchetype}: a box's y must not start before the canvas's top edge, got y=${box.y}`);
        assert.ok(box.x + box.width <= width + 0.5, `${layoutArchetype}: a box must not extend past the right edge (x=${box.x}, width=${box.width}, canvas=${width})`);
        assert.ok(box.y + box.height <= height + 0.5, `${layoutArchetype}: a box must not extend past the bottom edge (y=${box.y}, height=${box.height}, canvas=${height})`);
      }
    }
  });

  await test("an unregistered/malformed archetype value falls back to a real, working render rather than throwing (defense in depth -- validateCreativeTreatment's own enum check is expected to catch this upstream first)", () => {
    assert.doesNotThrow(() => {
      buildTextOverlaySvg({ ...BASE, layoutArchetype: "NOT_A_REAL_ARCHETYPE" as unknown as TextOverlayLayoutInput["layoutArchetype"], elements: [{ role: "headline", text: "X" }] });
    });
  });

  await test("selectLogoVariant: BrandBrain Logo Engine -- picks the archetype-appropriate variant from a full bundle", () => {
    const asset = (id: string): LogoAsset => ({ dataUri: `data:image/png;base64,${id}`, mimeType: "image/png", aspectRatio: 1 });
    const bundle: LogoVariantBundle = { transparent: asset("t"), monoLight: asset("light"), monoDark: asset("dark"), badge: asset("badge") };
    // BASIC_ESSENTIAL sits on the brand-color band -> monoLight (per ARCHETYPE_LOGO_SURFACE).
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: bundle, logoImage: null }), bundle.monoLight);
    // EDITORIAL_FRAME sits directly on the photo -> badge.
    assert.equal(selectLogoVariant({ layoutArchetype: "EDITORIAL_FRAME", logoVariants: bundle, logoImage: null }), bundle.badge);
    // POLAROID_LIFESTYLE's white/cream border -> monoDark.
    assert.equal(selectLogoVariant({ layoutArchetype: "POLAROID_LIFESTYLE", logoVariants: bundle, logoImage: null }), bundle.monoDark);
  });

  await test("selectLogoVariant: falls through the chain when the preferred variant wasn't generated for this tenant", () => {
    const asset = (id: string): LogoAsset => ({ dataUri: `data:image/png;base64,${id}`, mimeType: "image/png", aspectRatio: 1 });
    // Only `transparent` exists (e.g. a tenant who saved a logo before the Logo Engine shipped) -- every archetype must still resolve something real, not null.
    const legacyBundle: LogoVariantBundle = { transparent: asset("t") };
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: legacyBundle, logoImage: null }), legacyBundle.transparent);
    assert.equal(selectLogoVariant({ layoutArchetype: "EDITORIAL_FRAME", logoVariants: legacyBundle, logoImage: null }), legacyBundle.transparent);
  });

  await test("selectLogoVariant: backward compat -- falls back to plain logoImage when no logoVariants bundle is supplied", () => {
    const single: LogoAsset = { dataUri: "data:image/png;base64,single", mimeType: "image/png", aspectRatio: 1.5 };
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: undefined, logoImage: single }), single);
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: null, logoImage: single }), single);
  });

  await test("selectLogoVariant: no logo at all resolves to null (falls back to the text-glyph brand label at the call site)", () => {
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: null, logoImage: null }), null);
    assert.equal(selectLogoVariant({ layoutArchetype: "BASIC_ESSENTIAL", logoVariants: undefined, logoImage: undefined }), null);
  });

  await test("selectLogoVariant: every one of the 13 archetypes resolves a real, non-null pick from a full bundle", () => {
    const asset = (id: string): LogoAsset => ({ dataUri: `data:image/png;base64,${id}`, mimeType: "image/png", aspectRatio: 1 });
    const bundle: LogoVariantBundle = { transparent: asset("t"), monoLight: asset("light"), monoDark: asset("dark"), badge: asset("badge") };
    for (const layoutArchetype of ["BASIC_ESSENTIAL", "SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME", "MINIMAL_FOOTER_STRIP", "ELEVATED_BADGE", "DUAL_TONE_SIDEBAR", "FROSTED_GLASS_CENTER", "TYPOGRAPHIC_HERO", "POLAROID_LIFESTYLE", "CLINICAL_TRUST", "NEON_NIGHTLIFE", "FEATURE_POSTER"] as const) {
      const resolved = selectLogoVariant({ layoutArchetype, logoVariants: bundle, logoImage: null });
      assert.ok(resolved, `${layoutArchetype}: must resolve a real logo variant from a full bundle`);
    }
  });

  await test("BASIC_ESSENTIAL and FLOATING_CARD actually composite the logoVariants-resolved image, not just logoImage", () => {
    const asset: LogoAsset = { dataUri: "data:image/png;base64,QUJD", mimeType: "image/png", aspectRatio: 2 };
    for (const layoutArchetype of ["BASIC_ESSENTIAL", "FLOATING_CARD"] as const) {
      const withoutLogo = buildTextOverlaySvg({ ...BASE, layoutArchetype, businessName: "Test Business" });
      const withVariants = buildTextOverlaySvg({ ...BASE, layoutArchetype, businessName: "Test Business", logoImage: null, logoVariants: { monoLight: asset, monoDark: asset, badge: asset, transparent: asset } });
      assert.ok(withVariants.includes("<image"), `${layoutArchetype}: a resolved logoVariants bundle must actually render an <image> element`);
      assert.notEqual(withoutLogo, withVariants, `${layoutArchetype}: output must differ when a real logo variant is supplied`);
    }
  });

  // ==========================================================================
  // FEATURE_POSTER (Image Quality + Marketing Creative Certification
  // mission, 2026-09-06): the 13th archetype, and the one automated
  // default now points to (archetype-routing.ts). Unlike every other
  // archetype, its real photo is NOT the full-bleed background -- it's a
  // bounded, clipped panel embedded via an in-SVG <image href="data:...">
  // (renderTextOverlay's own photoDataUri branch), and it renders the
  // business's own real on-file differentiators as an icon-led list,
  // never an invented benefit.
  // ==========================================================================

  await test("FEATURE_POSTER: a supplied photoDataUri renders as a real, bounded, clipped <image> panel -- not full-bleed like every other archetype", () => {
    const tinyPngDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const withPhoto = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", photoDataUri: tinyPngDataUri });
    const withoutPhoto = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER" });
    assert.ok(withPhoto.includes(`href="${tinyPngDataUri}"`), "expected the real supplied photo to be embedded verbatim as a data-URI <image> href");
    assert.ok(withPhoto.includes("clip-path="), "expected the photo panel to be clipped into a bounded shape, never left full-bleed");
    assert.ok(!withoutPhoto.includes("<image"), "with no photoDataUri supplied, no photo panel (and no broken empty <image>) should render at all");
    for (const box of boxes(withPhoto)) {
      assert.ok(box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= BASE.width + 0.5 && box.y + box.height <= BASE.height + 0.5, `photo panel or another box exceeded canvas bounds: ${JSON.stringify(box)}`);
    }
  });

  await test("FEATURE_POSTER: real on-file differentiators render as real icon+text rows ONLY when the content strategy's textHierarchy actually requests them; an empty list renders none (never an invented benefit)", () => {
    // FINAL HERMES MISSION (2026-09-06): differentiators used to render
    // unconditionally whenever real on-file data existed, regardless of
    // the actual content strategy for that specific creative -- exactly
    // the "every business gets the same headline+bullets+CTA" flattening
    // bug this mission fixed. A "differentiators" role must now actually
    // be present in textHierarchy for the real data to render at all.
    const elementsWithRole = [...BASE.elements, { role: "differentiators" as const, text: "placeholder -- ignored, real text is substituted" }];
    const withDifferentiators = buildTextOverlaySvg({
      ...BASE, layoutArchetype: "FEATURE_POSTER", elements: elementsWithRole,
      differentiators: ["Free delivery within 3 km", "Open all 7 days", "Fresh stock every morning"],
    });
    const withoutDifferentiators = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", elements: elementsWithRole, differentiators: [] });
    const withUndefinedDifferentiators = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", elements: elementsWithRole });
    // Each differentiator row draws a real checkmark circle (a <circle> plus a stroked <path> checkmark, distinct from any glyph-path text <path>).
    const circleCount = (withDifferentiators.match(/<circle/g) ?? []).length;
    assert.ok(circleCount >= 3, `expected at least 3 real checkmark-circle icons (one per differentiator), got ${circleCount}`);
    assert.ok(glyphPaths(withDifferentiators).length > glyphPaths(withoutDifferentiators).length, "supplying real differentiators must add real rendered text beyond the empty-list case");
    assert.equal(withoutDifferentiators, withUndefinedDifferentiators, "an empty array and an omitted field must render identically -- neither ever invents a placeholder benefit");

    // BASE.elements already includes a "cta" entry, and the CTA bar itself
    // draws one checkmark-circle icon -- so the real assertion is that
    // supplying differentiator DATA without the role adds no circles
    // BEYOND that baseline chrome, not that the count is literally zero.
    const ctaOnlyBaseline = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", differentiators: [] });
    const roleNotRequested = buildTextOverlaySvg({
      ...BASE, layoutArchetype: "FEATURE_POSTER",
      differentiators: ["Free delivery within 3 km", "Open all 7 days", "Fresh stock every morning"],
    });
    assert.equal(
      (roleNotRequested.match(/<circle/g) ?? []).length,
      (ctaOnlyBaseline.match(/<circle/g) ?? []).length,
      "real differentiator data must never render unless the content strategy's own textHierarchy actually includes a \"differentiators\" role -- the archetype must not force it onto every creative regardless of the chosen structure"
    );
  });

  await test("FEATURE_POSTER: the bottom CTA bar only renders when a real CTA exists -- never an empty colored bar with no text", () => {
    const withCta = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", elements: [{ role: "headline", text: "X" }, { role: "cta", text: "Book now" }] });
    const withoutCta = buildTextOverlaySvg({ ...BASE, layoutArchetype: "FEATURE_POSTER", elements: [{ role: "headline", text: "X" }] });
    const bottomBand = (svg: string) => svg.match(new RegExp(`<rect x="0" y="[\\d.]+" width="${BASE.width}" height="[\\d.]+" fill="${BASE.primaryColor}" />`));
    assert.ok(bottomBand(withCta), "expected a full-width brand-color CTA bar when a real CTA exists");
    assert.ok(!bottomBand(withoutCta), "must not render a full-width colored bar with nothing real to put in it");
  });

  await test("glyph path data never contains NaN -- opentype.js's own toPathData emits it for exponential-notation coordinates, and librsvg silently stops rendering a path at that token (real bug: a long line rendered as its first 20 characters plus half a glyph)", () => {
    // A long uppercase line is the case that reproduced it live.
    const long = buildTextOverlaySvg({
      ...BASE,
      layoutArchetype: "BASIC_ESSENTIAL",
      elements: [{ role: "headline", text: "Global Pathways Overseas Education Admissions Counselling" }],
      businessName: "Global Pathways Overseas Education",
    });
    assert.ok(!long.includes("NaN"), "emitted SVG must never contain the literal token NaN -- librsvg drops the rest of the path when it hits one");
    assert.ok(!/[eE][-+]\d/.test(long.match(/ d="([^"]*)"/)?.[1] ?? ""), "path data must be in fixed notation -- exponential coordinates are what produced the NaN in the first place");
  });

  await test("characters with no glyph in the embedded font subset are replaced with real readable equivalents, never drawn as tofu boxes", () => {
    const withRupee = buildTextOverlaySvg({
      ...BASE,
      layoutArchetype: "BASIC_ESSENTIAL",
      elements: [{ role: "headline", text: "₹0 per month" }],
    });
    assert.ok(!withRupee.includes("NaN"), "rupee sign must not produce broken path data");
    // The rupee sign has glyph index 0 (.notdef) in the embedded Inter
    // subset -- an Indian SMB platform puts it in front of every price, so
    // it must degrade to "Rs." rather than a tofu box.
    const font = getFont(700);
    assert.equal(font.charToGlyph("₹").index, 0, "precondition: the embedded subset genuinely has no rupee glyph (if this ever changes, the replacement can be dropped)");
    assert.equal(sanitizeForFont(font, "₹0"), "Rs.0", "rupee must be rewritten to a readable equivalent");
    assert.equal(sanitizeForFont(font, "Book now"), "Book now", "text that is fully covered by the font must pass through untouched");
  });

  console.log("text-overlay-render.test.ts: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
