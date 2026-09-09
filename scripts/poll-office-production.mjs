const PROD_URL = "https://www.stratxcel.in";

async function pollDeployment() {
  console.log("Checking production deployment from Vercel...");
  for (let i = 1; i <= 12; i++) {
    try {
      const res = await fetch(`${PROD_URL}/admin`, {
        headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0 StratxcelVerification/2.0" },
      });
      console.log(`[Attempt ${i}/12] Status: ${res.status} | vercel-id: ${res.headers.get("x-vercel-id")} | age: ${res.headers.get("age")}`);
    } catch (e) {
      console.log(`[Attempt ${i}/12] Fetch error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

pollDeployment();
