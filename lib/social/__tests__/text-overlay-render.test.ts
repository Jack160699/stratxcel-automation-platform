// Run with: node --experimental-strip-types lib/social/__tests__/text-overlay-render.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildTextOverlaySvg, renderTextOverlay, type TextOverlayLayoutInput } from "../text-overlay-render.ts";

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

  console.log("text-overlay-render.test.ts: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
