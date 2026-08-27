import assert from "node:assert/strict";
import sharp from "sharp";
import { buildTextOverlaySvg, renderTextOverlay } from "../text-overlay-render.ts";

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

async function main() {
  await test("buildTextOverlaySvg embeds the exact headline/CTA/brand text as literal SVG text content", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1024,
      elements: [
        { role: "headline", text: "The 20-Minute Desk Reset" },
        { role: "cta", text: "Book a session" },
      ],
      typographyPersonality: "bold-condensed",
      textColor: "#FFFFFF",
      scrimColor: "#000000",
      accentColor: "#D62828",
      businessName: "IronCore Fitness",
    });
    assert.ok(svg.includes("The 20-Minute Desk Reset"));
    assert.ok(svg.includes("Book a session"));
    assert.ok(svg.includes("IronCore Fitness"));
    assert.ok(svg.startsWith("<svg"));
  });

  await test("XML-unsafe characters in text are escaped, not left raw", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1024,
      elements: [{ role: "headline", text: "Salt & Pepper <special>" }],
      typographyPersonality: "warm-humanist",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: null, businessName: "Test",
    });
    assert.ok(svg.includes("Salt &amp; Pepper &lt;special&gt;"));
    assert.ok(!svg.includes("Salt & Pepper <special>"));
  });

  await test("long headline wraps into multiple lines rather than a single overflowing line", () => {
    const svg = buildTextOverlaySvg({
      width: 800, height: 1000,
      elements: [{ role: "headline", text: "This is a genuinely long headline that should wrap across several lines instead of overflowing the frame" }],
      typographyPersonality: "editorial-serif",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: null, businessName: "Test",
    });
    const textElementCount = (svg.match(/<text /g) ?? []).length;
    assert.ok(textElementCount >= 3, `expected the long headline to wrap into multiple <text> lines, got ${textElementCount}`);
  });

  await test("zero text elements still produces valid minimal SVG with no scrim", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1024, elements: [],
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: null, businessName: "",
    });
    assert.ok(svg.startsWith("<svg"));
    assert.ok(!svg.includes("<rect"));
  });

  await test("a light accentColor pill gets dark CTA text, never the same white used for the rest of the on-photo text (regression: found white-on-white in real campaign output)", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1280,
      elements: [
        { role: "headline", text: "Expert family dental care" },
        { role: "cta", text: "Book a consultation" },
      ],
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF", // the general on-photo text color is white
      scrimColor: "#000000",
      accentColor: "#FFFFFF", // a light/white brand secondary used as the pill fill
      businessName: "Sunrise Dental Care",
    });
    // Extract the <text> element that renders the CTA content.
    const ctaMatch = svg.match(/<text[^>]*>Book a consultation<\/text>/);
    assert.ok(ctaMatch, "expected a <text> element containing the CTA copy");
    assert.ok(!ctaMatch![0].includes('fill="#FFFFFF"'), "CTA text must not be white when the pill fill is also white");
    assert.ok(ctaMatch![0].includes('fill="#111111"'), "CTA text should be dark for legibility against a light pill");
    // The headline (not on the pill) must still use the real on-photo textColor.
    const headlineMatch = svg.match(/<text[^>]*>Expert family dental care<\/text>/);
    assert.ok(headlineMatch![0].includes('fill="#FFFFFF"'));
  });

  await test("a dark accentColor pill keeps white CTA text", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1280,
      elements: [{ role: "cta", text: "Call now" }],
      typographyPersonality: "bold-condensed",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: "#111111", businessName: "Test",
    });
    const ctaMatch = svg.match(/<text[^>]*>Call now<\/text>/);
    assert.ok(ctaMatch![0].includes('fill="#FFFFFF"'));
  });

  await test("a long CTA wraps into multiple lines and its pill never extends past the canvas edges (regression: found clipped off-canvas in real campaign output)", () => {
    const width = 1024;
    const longCta = "Drop your questions below or book a consultation at our Indiranagar clinic";
    const svg = buildTextOverlaySvg({
      width, height: 1280,
      elements: [{ role: "cta", text: longCta }],
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: "#0077B6", businessName: "Test",
    });
    const ctaTextElements = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].filter((m) => longCta.includes(m[1]!.trim()) || m[1]!.trim().length && longCta.includes(m[1]!.trim()));
    assert.ok(ctaTextElements.length >= 2, `expected the long CTA to wrap into multiple <text> lines, got ${ctaTextElements.length}`);
    const rectMatch = svg.match(/<rect x="(-?\d+)" y="[^"]*" width="(\d+)"/);
    assert.ok(rectMatch, "expected a pill <rect> behind the CTA");
    const rectX = Number(rectMatch![1]);
    const rectWidth = Number(rectMatch![2]);
    assert.ok(rectX >= 0, `pill must not start off the left edge of the canvas, got x=${rectX}`);
    assert.ok(rectX + rectWidth <= width, `pill must not extend past the right edge of the canvas (x=${rectX}, width=${rectWidth}, canvas=${width})`);
  });

  await test("the brand label always gets a backing chip, regardless of what's behind it (regression: found nearly invisible over a light photo region in real campaign output)", () => {
    const svg = buildTextOverlaySvg({
      width: 1024, height: 1280,
      elements: [{ role: "headline", text: "Test headline" }],
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: null, businessName: "Sunrise Dental Care",
    });
    // Two rects expected: the bottom scrim band and the brand-label chip.
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    assert.ok(rectCount >= 2, `expected a scrim rect AND a brand-label backing chip, got ${rectCount} rect(s)`);
    assert.ok(svg.includes("Sunrise Dental Care"));
  });

  await test("renderTextOverlay produces a real, valid, correctly-sized PNG composited over a base photo", async () => {
    const base = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 40, g: 40, b: 40 } } }).png().toBuffer();
    const out = await renderTextOverlay(base, {
      width: 1024, height: 1024,
      elements: [
        { role: "headline", text: "Real Composite Test" },
        { role: "cta", text: "See more" },
        { role: "brandLabel", text: "Test Business" },
      ],
      typographyPersonality: "confident-display",
      textColor: "#FFFFFF", scrimColor: "#000000", accentColor: "#D62828", businessName: "Test Business",
    });
    assert.ok(Buffer.isBuffer(out));
    assert.ok(out.length > 1000, "expected a real, non-trivial PNG byte size");
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1024);
  });

  console.log("text-overlay-render.test.ts: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
