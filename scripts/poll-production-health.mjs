const PROD_URL = "https://www.stratxcel.in";

async function main() {
  console.log("Polling production health at https://www.stratxcel.in/api/health ...");
  for (let i = 1; i <= 25; i++) {
    try {
      const res = await fetch(`${PROD_URL}/api/health`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      console.log(`[Attempt ${i}/30] HTTP ${res.status} | Commit: ${data.commit ?? "null"} | Status: ${data.status}`);
      if (data.commit && (data.commit.startsWith("b62b0ef") || data.commit === "b62b0ef")) {
        console.log(`\n🎉 Production deployed with commit: ${data.commit}`);
        process.exit(0);
      }
    } catch (err) {
      console.log(`[Attempt ${i}/25] Error: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
}

main();
