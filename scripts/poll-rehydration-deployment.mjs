import https from "node:https";

const TARGET_URL = "https://www.stratxcel.in/api/health";

function check() {
  return new Promise((resolve) => {
    https.get(TARGET_URL, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, body });
      });
    }).on("error", (err) => {
      resolve({ error: err.message });
    });
  });
}

async function main() {
  console.log("Checking live production deployment...");
  for (let i = 0; i < 15; i++) {
    const result = await check();
    console.log(`[Attempt ${i + 1}] Status:`, result.status, "Body:", result.body);
    if (result.status === 200) {
      console.log("Production endpoint healthy and active.");
      break;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main();
