import assert from "node:assert/strict";

const PROD_URL = "https://www.stratxcel.in";

async function checkProduction() {
  console.log(`Checking production HTML response from ${PROD_URL}...`);
  const response = await fetch(PROD_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StratxcelVerification/1.0",
      "Cache-Control": "no-cache",
    },
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log(`x-vercel-id: ${response.headers.get("x-vercel-id")}`);
  console.log(`age: ${response.headers.get("age")}`);

  const html = await response.text();

  const hasNewHeadline1 = html.includes("You run your business.");
  const hasNewHeadline2 = html.includes("We help you get more on");
  const hasAuditCTA = html.includes("START MY ₹999 BUSINESS AUDIT") || html.includes("START MY ₹999 AUDIT");
  const hasBenefitStrip = html.includes("SAVE TIME") && html.includes("REDUCE COSTS") && html.includes("BETTER QUALITY");
  const hasTrustPillar = html.includes("YOU STAY IN CONTROL.");
  const hasOldHeadline = html.includes("operating system for modern business");

  console.log("------------------------------------------");
  console.log("PRODUCTION HTML CHECKS:");
  console.log(`- Headline 'You run your business.': ${hasNewHeadline1 ? "FOUND" : "MISSING"}`);
  console.log(`- Headline 'We help you get more on': ${hasNewHeadline2 ? "FOUND" : "MISSING"}`);
  console.log(`- Audit CTA: ${hasAuditCTA ? "FOUND" : "MISSING"}`);
  console.log(`- Benefit Strip: ${hasBenefitStrip ? "FOUND" : "MISSING"}`);
  console.log(`- Trust & Control ('YOU STAY IN CONTROL.'): ${hasTrustPillar ? "FOUND" : "MISSING"}`);
  console.log(`- Old 'operating system' homepage: ${hasOldHeadline ? "STILL PRESENT (OLD)" : "REMOVED (CLEAN)"}`);
  console.log("------------------------------------------");

  return {
    isNew: hasNewHeadline1 && hasNewHeadline2 && hasAuditCTA && hasBenefitStrip && hasTrustPillar && !hasOldHeadline,
    details: { hasNewHeadline1, hasNewHeadline2, hasAuditCTA, hasBenefitStrip, hasTrustPillar, hasOldHeadline },
  };
}

async function main() {
  for (let attempt = 1; attempt <= 20; attempt++) {
    console.log(`\n[Attempt ${attempt}/20]`);
    try {
      const { isNew, details } = await checkProduction();
      if (isNew) {
        console.log("\n>>> SUCCESS: Production is live with the new implementation! <<<\n");
        process.exit(0);
      } else {
        console.log("Vercel build is still completing or cache is updating. Retrying in 10s...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (err) {
      console.error("Fetch error:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  console.error("Timed out waiting for production deployment.");
  process.exit(1);
}

main();
