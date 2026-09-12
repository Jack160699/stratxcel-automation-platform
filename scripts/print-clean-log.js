import fs from "node:fs";

try {
  const content = fs.readFileSync("/tmp/acceptance.log", "utf8");
  // Replace non-ascii chars like ₹ with Rs. to prevent Windows console encoding crashes
  const clean = content.replace(/₹/g, "Rs. ").replace(/[^\x00-\x7F]/g, " ");
  console.log(clean);
} catch (e) {
  console.error("Error reading /tmp/acceptance.log:", e.message);
}
