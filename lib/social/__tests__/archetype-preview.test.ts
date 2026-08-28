// Run with: node --experimental-strip-types lib/social/__tests__/archetype-preview.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { ARCHETYPE_IDS } from "../archetype-registry.ts";
import { buildArchetypePreviewFixture, renderArchetypePreview, PREVIEW_SIZE } from "../archetype-preview.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`archetype-preview.test.ts: ${name} — PASS`);
    } catch (err) {
      console.error(`archetype-preview.test.ts: ${name} — FAIL`);
      throw err;
    }
  })();
}

async function main() {
  await test("every one of the 12 archetypes renders a real 1080x1080 PNG without throwing", async () => {
    for (const id of ARCHETYPE_IDS) {
      const png = await renderArchetypePreview(id);
      const meta = await sharp(png).metadata();
      assert.equal(meta.format, "png", `${id}: not a PNG`);
      assert.equal(meta.width, PREVIEW_SIZE, `${id}: wrong width`);
      assert.equal(meta.height, PREVIEW_SIZE, `${id}: wrong height`);
      assert.ok(png.length > 1000, `${id}: suspiciously small output, likely a near-blank render`);
    }
  });

  await test("an unknown archetype id is rejected rather than silently rendering a default", async () => {
    await assert.rejects(() => renderArchetypePreview("NOT_A_REAL_ARCHETYPE" as never));
  });

  await test("the preview fixture uses the real registry's layoutArchetype for every id -- never a mismatched/hardcoded one", () => {
    for (const id of ARCHETYPE_IDS) {
      const fixture = buildArchetypePreviewFixture(id);
      assert.equal(fixture.layoutArchetype, id);
      assert.equal(fixture.width, PREVIEW_SIZE);
      assert.equal(fixture.height, PREVIEW_SIZE);
      assert.ok(fixture.elements.some((e) => e.role === "headline" && e.text.trim()), `${id}: fixture has no headline`);
      assert.ok(fixture.businessName.trim(), `${id}: fixture has no business name`);
    }
  });

  await test("two renders of the same archetype are byte-identical -- deterministic, not time/random-seeded", async () => {
    const first = await renderArchetypePreview("SPLIT_BANNER");
    const second = await renderArchetypePreview("SPLIT_BANNER");
    assert.ok(first.equals(second), "SPLIT_BANNER preview render is non-deterministic across calls");
  });

  console.log("archetype-preview.test.ts: ALL PASS");
}

await main();
