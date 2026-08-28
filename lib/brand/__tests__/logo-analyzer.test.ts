// Run with: node --experimental-strip-types lib/brand/__tests__/logo-analyzer.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { analyzeLogo, buildBoundedBadge, buildMonochromeKnockout, extractTransparentLogo } from "../logo-analyzer.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`logo-analyzer.test.ts: ${name} — PASS`);
    } catch (err) {
      console.error(`logo-analyzer.test.ts: ${name} — FAIL`);
      throw err;
    }
  })();
}

/** A logo on a solid, uniform background -- the real case this pipeline
 * is meant to clean up. */
async function solidBackgroundLogoFixture(bg = "#FFFFFF", fg = "#0B3D91"): Promise<Buffer> {
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="${bg}"/><circle cx="100" cy="100" r="60" fill="${fg}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A real, already-transparent PNG cutout. */
async function realTransparentLogoFixture(): Promise<Buffer> {
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="60" fill="#0B3D91"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer(); // SVG rasterization gives real alpha=0 outside the circle
}

/** A busy/photo-like image with genuinely different corner colors -- the
 * pipeline must NOT guess a background here. */
async function busyPhotoFixture(): Promise<Buffer> {
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#D62828"/><stop offset="100%" stop-color="#0B3D91"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return data[idx + 3]!;
}

async function rgbAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx]!, data[idx + 1]!, data[idx + 2]!];
}

async function main() {
  await test("a logo on a solid white background gets its corners made transparent", async () => {
    const fixture = await solidBackgroundLogoFixture();
    const { png, backgroundRemoved } = await extractTransparentLogo(fixture);
    assert.equal(backgroundRemoved, true);
    assert.equal(await alphaAt(png, 2, 2), 0, "corner (part of the detected background) must be fully transparent");
    assert.ok((await alphaAt(png, 100, 100)) > 200, "the logo's own center must stay opaque");
  });

  await test("a logo on a solid black background also gets cleaned", async () => {
    const fixture = await solidBackgroundLogoFixture("#000000", "#F4A300");
    const { backgroundRemoved, png } = await extractTransparentLogo(fixture);
    assert.equal(backgroundRemoved, true);
    assert.equal(await alphaAt(png, 2, 2), 0);
    assert.ok((await alphaAt(png, 100, 100)) > 200);
  });

  await test("a real, already-transparent PNG is left alone (backgroundRemoved: false) and stays transparent", async () => {
    const fixture = await realTransparentLogoFixture();
    const { png, backgroundRemoved } = await extractTransparentLogo(fixture);
    assert.equal(backgroundRemoved, false, "already-transparent input must not be reprocessed");
    assert.equal(await alphaAt(png, 2, 2), 0, "the real transparent corner must remain transparent");
  });

  await test("a busy gradient image is NOT mistaken for a solid background -- conservative no-op", async () => {
    const fixture = await busyPhotoFixture();
    const { backgroundRemoved } = await extractTransparentLogo(fixture);
    assert.equal(backgroundRemoved, false, "corners genuinely differ in color -- must not guess a background and cut a hole into a real image");
  });

  await test("buildMonochromeKnockout: opaque pixels become the exact target color, transparent pixels stay transparent", async () => {
    const fixture = await realTransparentLogoFixture();
    const light = await buildMonochromeKnockout(fixture, "#FFFFFF");
    const dark = await buildMonochromeKnockout(fixture, "#1A1A1A");
    assert.deepEqual(await rgbAt(light, 100, 100), [255, 255, 255]);
    assert.equal(await alphaAt(light, 2, 2), 0);
    assert.deepEqual(await rgbAt(dark, 100, 100), [0x1a, 0x1a, 0x1a]);
    assert.equal(await alphaAt(dark, 2, 2), 0);
  });

  await test("buildBoundedBadge: produces a real fixed-size white circular badge with the logo actually composited inside", async () => {
    const fixture = await realTransparentLogoFixture();
    const badge = await buildBoundedBadge(fixture);
    const meta = await sharp(badge).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    // Center of the badge should be the logo's own dark-blue color (opaque, composited), not the plain white container.
    const [r, g, b] = await rgbAt(badge, 256, 256);
    assert.ok(!(r === 255 && g === 255 && b === 255), "badge center must be the composited logo, not bare white container");
  });

  await test("analyzeLogo: end-to-end produces all 4 real, valid PNG variants", async () => {
    const fixture = await solidBackgroundLogoFixture();
    const result = await analyzeLogo(fixture);
    for (const key of ["transparent", "monoLight", "monoDark", "badge"] as const) {
      const meta = await sharp(result[key]).metadata();
      assert.equal(meta.format, "png", `${key} must be a real PNG`);
      assert.ok(meta.width! > 0 && meta.height! > 0, `${key} must have real dimensions`);
    }
    assert.equal(result.backgroundRemoved, true);
  });

  await test("extreme input: a tiny 4x4 image never throws and never guesses a background it can't sample corners from", async () => {
    const tiny = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 10, b: 10 } } }).png().toBuffer();
    const { backgroundRemoved } = await extractTransparentLogo(tiny);
    assert.equal(backgroundRemoved, false);
  });

  console.log("logo-analyzer.test.ts: ALL PASS");
}

await main();
