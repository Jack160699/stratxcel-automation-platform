import fs from "node:fs";

console.log("=== CHECKING DISK SPACE ===");
try {
  const statC = fs.statfsSync("C:\\");
  const freeC_GB = (statC.bfree * statC.bsize) / (1024 * 1024 * 1024);
  const totalC_GB = (statC.blocks * statC.bsize) / (1024 * 1024 * 1024);
  console.log(`C: Drive -> Free: ${freeC_GB.toFixed(3)} GB / Total: ${totalC_GB.toFixed(2)} GB`);
} catch (e) {
  console.log("C: Drive stat error:", e.message);
}

try {
  const statD = fs.statfsSync("D:\\");
  const freeD_GB = (statD.bfree * statD.bsize) / (1024 * 1024 * 1024);
  const totalD_GB = (statD.blocks * statD.bsize) / (1024 * 1024 * 1024);
  console.log(`D: Drive -> Free: ${freeD_GB.toFixed(3)} GB / Total: ${totalD_GB.toFixed(2)} GB`);
} catch (e) {
  console.log("D: Drive stat error:", e.message);
}
