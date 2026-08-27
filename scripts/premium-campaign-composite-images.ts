// Decodes real bridge image responses (base photography, generated with
// no on-image text per the prompt instruction) and composites each
// creative's own textHierarchy deterministically via sharp
// (text-overlay-render.ts -- Section 24), using its Brand Visual DNA for
// typography personality/text color/accent.
//
// Usage: node --experimental-strip-types scripts/premium-campaign-composite-images.ts <rescoredResultsJsonPath> <requestsDir> <outDir>

import fs from "node:fs";
import path from "node:path";
import { deriveBrandVisualDNA } from "../lib/social/brand-visual-dna.ts";
import { renderTextOverlay } from "../lib/social/text-overlay-render.ts";
import { resolveOverlayElements, type CreativeTreatment } from "../lib/social/creative-treatment.ts";
import { ALL_FIXTURES, type BusinessFixture } from "../lib/social/__tests__/fixtures/business-fixtures.ts";

const RESULTS_PATH = process.argv[2];
const REQUESTS_DIR = process.argv[3];
const OUT_DIR = process.argv[4];
if (!RESULTS_PATH || !REQUESTS_DIR || !OUT_DIR) {
  console.error("Usage: premium-campaign-composite-images.ts <rescoredResultsJsonPath> <requestsDir> <outDir>");
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// Finished Premium Marketing Creative brief Section 4: default Instagram
// feed canvas is 1080x1080 square (1024x1024 here to match OpenAI's own
// default output size exactly). Real bug this also incidentally fixes:
// the OpenAI provider path (packages/ai-runtime/src/media/image.ts
// generateOpenAI) never reads request.aspectRatio at all -- only
// request.size, which always defaulted to "1024x1024" regardless of what
// aspectRatio was requested -- so every base photo generated so far was
// already square. Compositing onto a mismatched 1024x1280 canvas forced
// sharp's "cover" fit to crop ~10% off both sides of every real image
// without that ever being visible in metadata. Matching the canvas to the
// real source dimensions removes that unnecessary crop entirely.
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1024;

// Real bug fixed here: resolveOverlayElements, never treatment.textHierarchy
// directly -- the model routinely set cta.needed=true with a real CTA
// without duplicating it into textHierarchy, so 8/14 real passing
// creatives in one benchmark run silently rendered with no CTA at all
// despite the treatment clearly intending one.
type Treatment = CreativeTreatment;
interface Result {
  fixture: string;
  index: number;
  rescoredPassed: boolean;
  treatment: Treatment | null;
}

function fixtureByKey(key: string): BusinessFixture {
  const found = ALL_FIXTURES.find((f) => f.key === key);
  if (!found) throw new Error(`unknown fixture: ${key}`);
  return found;
}

const data: Result[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
const passing = data.filter((d) => d.rescoredPassed);

const manifest: Array<{ file: string; provider: string; model: string; costUsd: number; overlayApplied: boolean }> = [];

async function main() {
  for (const p of passing) {
    const respPath = path.join(REQUESTS_DIR, `${p.fixture}-${p.index + 1}.response.json`);
    if (!fs.existsSync(respPath)) {
      console.log(`SKIP ${p.fixture}#${p.index + 1}: no response file`);
      continue;
    }
    const resp = JSON.parse(fs.readFileSync(respPath, "utf8"));
    if (resp.outcome !== "OK" || !resp.candidates?.length) {
      console.log(`FAILED ${p.fixture}#${p.index + 1}: outcome=${resp.outcome} reason=${resp.reason}`);
      continue;
    }
    const candidate = resp.candidates[0];
    const match = candidate.uri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      console.log(`FAILED ${p.fixture}#${p.index + 1}: not a data: URI`);
      continue;
    }
    const baseImage = Buffer.from(match[2], "base64");
    const fixture = fixtureByKey(p.fixture);
    const brandDNA = deriveBrandVisualDNA({ brandColors: fixture.brandColors, brandTone: fixture.brandTone, industryCategory: p.fixture });

    let finalBuffer: Buffer = baseImage;
    let overlayApplied = false;
    const resolvedElements = p.treatment ? resolveOverlayElements(p.treatment) : [];
    if (p.treatment && !p.treatment.intentionallyTextLed && resolvedElements.length) {
      // width/height match the requested canvas at a real social
      // resolution -- OpenAI's actual returned image dimensions vary by
      // size param; renderTextOverlay resizes to this canvas via sharp's
      // "cover" fit so the overlay's own coordinate math stays consistent
      // regardless of the source image's exact pixel dimensions.
      const width = CANVAS_WIDTH;
      const height = CANVAS_HEIGHT;
      const textColor = brandDNA.lightDarkPreference === "light" ? "#111111" : "#FFFFFF";
      finalBuffer = await renderTextOverlay(baseImage, {
        width, height,
        elements: [...resolvedElements, { role: "brandLabel", text: fixture.businessName }],
        typographyPersonality: brandDNA.typographyPersonality,
        textColor,
        scrimColor: "#000000",
        accentColor: brandDNA.accentColor,
        businessName: fixture.businessName,
      });
      overlayApplied = true;
    }

    const fileName = `${p.fixture}-${p.index + 1}.png`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), finalBuffer);
    manifest.push({ file: fileName, provider: candidate.provider, model: candidate.model, costUsd: candidate.estimatedCostUsd, overlayApplied });
    console.log(`OK ${fileName} (overlay=${overlayApplied}, ${finalBuffer.length} bytes)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nGenerated ${manifest.length}/${passing.length}. Manifest: ${path.join(OUT_DIR, "manifest.json")}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
