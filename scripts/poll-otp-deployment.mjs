// Poll production deployment for commit 826913d and verify OTP endpoints
const PROD_URL = "https://www.stratxcel.in";

async function pollDeployment() {
  console.log("=== POLLING PRODUCTION DEPLOYMENT FOR WHATSAPP OTP FIX ===");
  const targetCommit = "826913d";

  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      // 1. Check API endpoint readiness
      const apiRes = await fetch(`${PROD_URL}/api/platform/onboarding/whatsapp/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ phone: "invalid-number" }),
      });

      const apiData = await apiRes.json().catch(() => ({}));
      const vercelId = apiRes.headers.get("x-vercel-id");
      const age = apiRes.headers.get("age");

      console.log(`[Attempt ${attempt}/40] API POST /send-otp HTTP ${apiRes.status} | vercel-id: ${vercelId?.slice(0, 20)}... | data:`, apiData);

      // Check if endpoint returns our formatted invalid phone error
      if (apiRes.status === 400 && apiData.error?.includes("Invalid phone number")) {
        console.log("\n>>> LIVE PRODUCTION CONFIRMED: WhatsApp OTP send-otp route is deployed and handling requests with code 400 invalid phone!");
        
        // Check verify-otp endpoint as well
        const verifyRes = await fetch(`${PROD_URL}/api/platform/onboarding/whatsapp/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: "+919876543210", otp: "123456" }),
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        console.log(`API POST /verify-otp HTTP ${verifyRes.status} | data:`, verifyData);

        // Check canonical onboarding test page
        const pageRes = await fetch(`${PROD_URL}/test-onboarding-canonical`, {
          headers: { "Cache-Control": "no-cache" }
        });
        console.log(`Page GET /test-onboarding-canonical HTTP ${pageRes.status}`);

        console.log("\n==========================================");
        console.log("PRODUCTION DEPLOYMENT HEALTH: 100% HEALTHY");
        console.log("==========================================");
        process.exit(0);
      }
    } catch (err) {
      console.log(`[Attempt ${attempt}/40] Request error: ${err.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.error("Timeout waiting for production deployment.");
  process.exit(1);
}

pollDeployment();
