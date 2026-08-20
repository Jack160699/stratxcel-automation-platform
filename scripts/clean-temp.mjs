import fs from "node:fs";
import path from "node:path";
import os from "node:os";

console.log("=== CLEANING C: DRIVE TEMP DIRECTORY ===");
const tempDir = os.tmpdir();
console.log("Temp Dir:", tempDir);

let cleanedBytes = 0;
let cleanedFiles = 0;

try {
  const entries = fs.readdirSync(tempDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(tempDir, entry.name);
    try {
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleanedFiles++;
      } else {
        const stat = fs.statSync(fullPath);
        fs.unlinkSync(fullPath);
        cleanedBytes += stat.size;
        cleanedFiles++;
      }
    } catch {}
  }
} catch (e) {
  console.log("Clean error:", e.message);
}

console.log(`Cleaned ${cleanedFiles} items (${(cleanedBytes / (1024 * 1024)).toFixed(2)} MB)`);

// Check C: space again
try {
  const statC = fs.statfsSync("C:\\");
  const freeC_GB = (statC.bfree * statC.bsize) / (1024 * 1024 * 1024);
  console.log(`C: Drive Now Free: ${freeC_GB.toFixed(3)} GB`);
} catch (e) {}
