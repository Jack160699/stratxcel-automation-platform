async function poll() {
  for (let i = 1; i <= 30; i++) {
    try {
      const res = await fetch("https://www.stratxcel.in/test-onboarding-canonical", {
        headers: { "Cache-Control": "no-cache" },
      });
      const text = await res.text();
      const hasGbp = text.includes("Google Business");
      console.log(`[Attempt ${i}/30] Status: ${res.status} | Length: ${text.length} | Has Google Business: ${hasGbp}`);
      if (hasGbp) {
        console.log(">>> NEW DEPLOYMENT IS LIVE ON PRODUCTION!");
        process.exit(0);
      }
    } catch (e) {
      console.log(`[Attempt ${i}/30] Network error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.error("Timeout waiting for deployment.");
  process.exit(1);
}
poll();
