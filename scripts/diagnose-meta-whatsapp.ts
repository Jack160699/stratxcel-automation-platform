// Safe Diagnostic Script: Inspects Meta WhatsApp configuration, checks template on WABA, and tests API response.
// Run with: node --experimental-strip-types scripts/diagnose-meta-whatsapp.ts [optional-test-phone]
import { getMetaWhatsAppCredentials, sendMetaAuthenticationOtp, normalizePhoneNumberE164, getMetaPhoneDigits } from "../packages/whatsapp/src/otp.ts";

async function main() {
  console.log("=== META WHATSAPP CONFIGURATION CHECK ===");
  
  const token =
    process.env.WHATSAPP_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    process.env.META_WHATSAPP_ACCESS_TOKEN;
    
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;

  const wabaId =
    process.env.WHATSAPP_WABA_ID ||
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  const apiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    "v20.0";

  console.log("WHATSAPP_TOKEN / META_ACCESS_TOKEN:", token ? "PRESENT (length: " + token.length + ")" : "MISSING");
  console.log("WHATSAPP_PHONE_NUMBER_ID:", phoneNumberId ? "PRESENT (" + phoneNumberId + ")" : "MISSING");
  console.log("WHATSAPP_WABA_ID / BUSINESS_ACCOUNT_ID:", wabaId ? "PRESENT (" + wabaId + ")" : "MISSING");
  console.log("WHATSAPP_GRAPH_API_VERSION:", apiVersion);

  if (!token || !phoneNumberId) {
    console.log("\n[DIAGNOSTIC NOTICE] Real WhatsApp message delivery requires WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to be set in your deployment / server environment.");
    return;
  }

  // 1. Inspect Token / Phone Number ID via Graph API
  console.log("\n=== 1. QUERYING PHONE NUMBER ID INFO ===");
  try {
    const phoneRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const phoneData = await phoneRes.json();
    console.log("Phone Number ID Query HTTP Status:", phoneRes.status);
    console.log("Phone Number Response:", JSON.stringify(phoneData, null, 2));
  } catch (err) {
    console.log("Phone query error:", err);
  }

  // 2. Query Templates from WABA
  const targetWabaId = wabaId || phoneNumberId;
  if (targetWabaId) {
    console.log(`\n=== 2. QUERYING TEMPLATES ON WABA ${targetWabaId} ===`);
    try {
      const tplRes = await fetch(`https://graph.facebook.com/${apiVersion}/${targetWabaId}/message_templates?fields=name,status,category,language,components,id&limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const tplData = await tplRes.json() as any;
      console.log("Template Query HTTP Status:", tplRes.status);
      if (tplData.data) {
        console.log(`Found ${tplData.data.length} templates:`);
        for (const t of tplData.data) {
          console.log(`- Name: ${t.name} | Status: ${t.status} | Lang: ${t.language} | Category: ${t.category} | ID: ${t.id}`);
          if (t.name === "stratxcel_login_otp") {
            console.log("  COMPONENTS:", JSON.stringify(t.components, null, 2));
          }
        }
      } else {
        console.log("Template Query Error:", JSON.stringify(tplData, null, 2));
      }
    } catch (err) {
      console.log("Template query error:", err);
    }
  }

  // 3. Optional Direct Test Send
  const testPhoneArg = process.argv[2];
  if (testPhoneArg) {
    const normalized = normalizePhoneNumberE164(testPhoneArg);
    if (!normalized) {
      console.log("\n[ERROR] Invalid test phone number:", testPhoneArg);
      return;
    }
    const digits = getMetaPhoneDigits(normalized);
    console.log(`\n=== 3. EXECUTING TEST SEND TO ${normalized} (${digits}) ===`);
    const testOtp = "123456";
    const res = await sendMetaAuthenticationOtp({
      toPhoneDigits: digits,
      otpCode: testOtp,
    });
    console.log("Test Send Result:", JSON.stringify(res, null, 2));
  }
}

main().catch(console.error);
