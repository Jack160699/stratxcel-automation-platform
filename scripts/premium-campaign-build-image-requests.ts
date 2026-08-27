// Builds real image-generation request bodies for the passing creatives
// from a premium-campaign results file, using each creative's own
// treatment.imageBrief (a visual-director prompt -- Section 23) with an
// explicit "no text" instruction appended, since text is composited
// deterministically afterward (Section 24) rather than left to the image
// model.
//
// Usage: node --experimental-strip-types scripts/premium-campaign-build-image-requests.ts <rescoredResultsJsonPath> <outDir>

import fs from "node:fs";
import path from "node:path";

const RESULTS_PATH = process.argv[2];
const OUT_DIR = process.argv[3];
if (!RESULTS_PATH || !fs.existsSync(RESULTS_PATH) || !OUT_DIR) {
  console.error("Usage: premium-campaign-build-image-requests.ts <rescoredResultsJsonPath> <outDir>");
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Result {
  fixture: string;
  index: number;
  rescoredPassed: boolean;
  treatment: { imageBrief?: string; intentionallyTextLed: boolean; textHierarchy: unknown[] } | null;
  imageBrief: string | null;
}

const data: Result[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
const passing = data.filter((d) => d.rescoredPassed);

let written = 0;
for (const p of passing) {
  if (!p.imageBrief) {
    console.log(`SKIP ${p.fixture}#${p.index + 1}: no imageBrief (treatment missing)`);
    continue;
  }
  const noTextInstruction = p.treatment?.intentionallyTextLed
    ? ""
    : "\n\nCRITICAL: Do not render any text, words, letters, numbers, logos, or typography anywhere in this image. This is a pure photograph -- all on-image text will be added separately by a deterministic compositing step, not by you.";
  const prompt = p.imageBrief + noTextInstruction;
  const body = {
    prompt,
    // Finished Premium Marketing Creative brief Section 4: default social
    // canvas is 1080x1080 square. Also matches the OpenAI provider path's
    // own default output size ("1024x1024") -- see
    // premium-campaign-composite-images.ts's header for why that specific
    // match matters (avoids a silent unnecessary crop).
    aspectRatio: "1:1",
    tier: "standard",
    tenantId: "premium-campaign-preview-bridge",
    forceProvider: "openai",
    quality: "medium",
  };
  const fileName = `${p.fixture}-${p.index + 1}.request.json`;
  fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(body), "utf8");
  written += 1;
  console.log(`${fileName}: prompt ${prompt.length} chars`);
}
console.log(`\nWrote ${written} request bodies to ${OUT_DIR}`);
