// Run with: node --experimental-strip-types lib/social/__tests__/composition-render.test.ts
import assert from "node:assert/strict";
import { buildCompositionSvg, parseCreativeComposition, type CreativeComposition } from "../composition-render.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`composition-render.test.ts: ${name} — PASS`);
    } catch (err) {
      console.error(`composition-render.test.ts: ${name} — FAIL`);
      throw err;
    }
  })();
}

const BASE = {
  width: 1024,
  height: 1024,
  businessName: "SunGrid Solar Solutions",
  photoDataUri: "data:image/png;base64,AAAA",
  primaryColor: "#0E2A47",
  secondaryColor: "#F5A623",
  accentColor: "#F5A623",
  logoImage: null,
  logoVariants: null,
};

async function main() {
  await test("the SAME business with two different strategies produces two structurally different designs -- the whole point of the composition layer", () => {
    const savings: CreativeComposition = {
      canvas: "photo_full",
      panel: "bottom",
      blocks: [
        { kind: "stat", value: "90%", caption: "Typical drop in a Pune electricity bill" },
        { kind: "cta", text: "Get your estimate" },
      ],
    };
    const journey: CreativeComposition = {
      canvas: "photo_side",
      panel: "left",
      blocks: [
        { kind: "headline", text: "Four stages. One installer." },
        { kind: "steps", items: ["Site survey", "Subsidy paperwork", "Installation", "Annual maintenance"] },
        { kind: "cta", text: "Book a survey" },
      ],
    };
    const a = buildCompositionSvg({ ...BASE, composition: savings });
    const b = buildCompositionSvg({ ...BASE, composition: journey });
    assert.notEqual(a, b, "two different strategies must not render identical SVG");
    // The stat design must contain an oversized figure; the journey design
    // must contain real numbered step markers. Neither may contain the
    // other's structure -- that is what "format follows strategy" means.
    assert.ok((b.match(/<circle/g) ?? []).length >= 4, "a steps composition must draw real numbered stage markers");
    assert.ok((a.match(/<circle/g) ?? []).length < 4, "a stat-led composition must NOT inherit the step markers of a different strategy");
  });

  await test("every canvas mode places the photograph differently -- imagery position is a real compositional decision, not decoration", () => {
    const blocks: CreativeComposition["blocks"] = [{ kind: "headline", text: "Cut your power bill" }];
    const seen = new Set<string>();
    for (const canvas of ["photo_full", "photo_top", "photo_side", "photo_inset"] as const) {
      const svg = buildCompositionSvg({ ...BASE, composition: { canvas, blocks } });
      const image = svg.match(/<image [^>]*\/>/)?.[0];
      assert.ok(image, `canvas "${canvas}" must actually place the photograph`);
      seen.add(image!);
    }
    assert.equal(seen.size, 4, "each canvas mode must place the photo at a genuinely different geometry");
  });

  await test('canvas "solid" renders no photograph at all', () => {
    const svg = buildCompositionSvg({
      ...BASE,
      photoDataUri: null,
      composition: { canvas: "solid", blocks: [{ kind: "stat", value: "25 yrs", caption: "Performance warranty" }] },
    });
    assert.ok(!svg.includes("<image"), "a deliberately photo-free composition must not draw a photo");
  });

  await test("the business name is never truncated -- it shrinks to fit instead", () => {
    const longName = "Global Pathways Overseas Education Consultancy Services";
    const svg = buildCompositionSvg({
      ...BASE,
      businessName: longName,
      composition: { canvas: "photo_side", panel: "left", blocks: [{ kind: "headline", text: "Study abroad" }] },
    });
    assert.ok(!svg.includes("NaN"), "no broken path data");
    // An ellipsis in the lockup means it truncated rather than shrank.
    assert.ok(!svg.includes("…"), "the brand lockup must shrink to fit, never truncate the business name");
  });

  await test("parseCreativeComposition accepts a real AI payload and drops only the malformed blocks", () => {
    const parsed = parseCreativeComposition({
      canvas: "photo_top",
      blocks: [
        { kind: "eyebrow", text: "Rooftop solar" },
        { kind: "stat", value: "90%", caption: "Lower bills" },
        { kind: "nonsense", text: "should be dropped" },
        { kind: "badges", items: ["25-year warranty", "", "  "] },
        { kind: "headline", text: "   " },
        { kind: "cta", text: "Book a survey" },
      ],
    });
    assert.ok(parsed, "a valid composition must parse");
    assert.deepEqual(parsed!.blocks.map((b) => b.kind), ["eyebrow", "stat", "badges", "cta"], "unknown kinds and empty-text blocks are dropped; real ones are kept in order");
    assert.deepEqual((parsed!.blocks[2] as { items: string[] }).items, ["25-year warranty"], "blank list entries are dropped rather than rendered as empty chips");
  });

  await test("parseCreativeComposition rejects unusable payloads so the caller falls back to the existing archetype path instead of rendering a broken creative", () => {
    assert.equal(parseCreativeComposition(null), null);
    assert.equal(parseCreativeComposition({ blocks: [{ kind: "headline", text: "x" }] }), null, "missing canvas");
    assert.equal(parseCreativeComposition({ canvas: "not_a_canvas", blocks: [{ kind: "headline", text: "x" }] }), null, "unknown canvas");
    assert.equal(parseCreativeComposition({ canvas: "photo_full", blocks: [] }), null, "no blocks");
    assert.equal(parseCreativeComposition({ canvas: "photo_full", blocks: [{ kind: "unknown", text: "x" }] }), null, "nothing usable left after dropping malformed blocks");
    assert.equal(parseCreativeComposition({ canvas: "photo_full", blocks: [{ kind: "steps", items: ["only one"] }] }), null, "a single-item 'process' is not a process");
  });

  await test("a comparison block renders two real labelled columns, not a sentence", () => {
    const svg = buildCompositionSvg({
      ...BASE,
      composition: {
        canvas: "photo_top",
        blocks: [
          { kind: "comparison", leftLabel: "On your own", leftItems: ["Guesswork"], rightLabel: "With us", rightItems: ["Profile-matched"] },
        ],
      },
    });
    // Two column header rects, one of them filled with the accent.
    assert.ok((svg.match(/<rect/g) ?? []).length >= 3, "a comparison must draw real column structure");
    assert.ok(svg.includes(BASE.secondaryColor), "the recommended column must be highlighted in the brand accent");
  });

  await test("rich compositions stay inside the canvas -- content is scaled down, never allowed to overflow the frame", () => {
    const svg = buildCompositionSvg({
      ...BASE,
      composition: {
        canvas: "photo_full",
        panel: "bottom",
        blocks: [
          { kind: "eyebrow", text: "Rooftop solar in Pune" },
          { kind: "headline", text: "Every panel we fit is backed for twenty five full years" },
          { kind: "benefits", items: ["Free annual maintenance visits", "Government subsidy paperwork handled end to end", "25-year performance warranty", "Net-metering applications filed for you"] },
          { kind: "badges", items: ["25-year warranty", "Subsidy handled", "Free maintenance"] },
          { kind: "cta", text: "Get in touch with our team" },
        ],
      },
    });
    const ys = [...svg.matchAll(/y="(-?[\d.]+)"/g)].map((m) => parseFloat(m[1]!));
    assert.ok(ys.every((y) => y <= BASE.height), `no element may be positioned below the canvas (max y seen: ${Math.max(...ys)})`);
    assert.ok(!svg.includes("NaN"), "no broken path data under heavy content");
  });

  console.log("composition-render.test.ts: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
