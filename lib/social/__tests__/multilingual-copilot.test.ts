import assert from "node:assert/strict";
import { classifySocialCopilotIntent } from "../agent/copilot-intents.ts";
import {
  classifyCreativeRequestMode,
  classifySocialPromptIntent,
} from "../agent/gemini-boundary.ts";
import { buildProviderReadyImagePrompt } from "@stratxcel/ai-runtime";
import { evaluateBrandTrustHardGate } from "../agent/trust-hard-gate.ts";
import { sanitizeUserFacingText } from "../agent/user-facing-text.ts";

async function run() {
  console.log("Running Multilingual Intent, Content, and Generation Test Suite...");

  // -------------------------------------------------------------------------
  // 1. Live Production Regression Prompts
  // -------------------------------------------------------------------------
  const liveBugPrompt = "अभी राखी के लिए पोस्ट बना दो";
  assert.equal(classifySocialCopilotIntent(liveBugPrompt), "PREPARE_CONTENT", "Short Hindi request -> PREPARE_CONTENT");
  assert.equal(classifyCreativeRequestMode(liveBugPrompt, false), "EXECUTE", "Short Hindi request -> EXECUTE mode");
  assert.equal(classifySocialPromptIntent(liveBugPrompt), "CREATIVE", "Short Hindi request -> CREATIVE intent");

  const promoPrompt = "अभी राखी के लिए promotional post बना दो";
  assert.equal(classifySocialCopilotIntent(promoPrompt), "PREPARE_CONTENT", "Hindi promotional post -> PREPARE_CONTENT");

  const posterPrompt = "अभी राखी के लिए पोस्टर बना दो";
  assert.equal(classifySocialCopilotIntent(posterPrompt), "PREPARE_CONTENT", "Hindi poster prompt -> PREPARE_CONTENT");

  const hinglishPost = "Rakhi ke liye ek post bana do";
  assert.equal(classifySocialCopilotIntent(hinglishPost), "PREPARE_CONTENT", "Hinglish post prompt -> PREPARE_CONTENT");

  const hinglishPoster = "Rakhi ke liye ek poster bana do";
  assert.equal(classifySocialCopilotIntent(hinglishPoster), "PREPARE_CONTENT", "Hinglish poster prompt -> PREPARE_CONTENT");

  const salonOffer = "Mere salon ke liye Rakhi ka offer post bana do";
  assert.equal(classifySocialCopilotIntent(salonOffer), "PREPARE_CONTENT", "Salon offer prompt -> PREPARE_CONTENT");

  // -------------------------------------------------------------------------
  // 2. Hindi (Devanagari) Intent & Mode Classification
  // -------------------------------------------------------------------------
  const hindiPrompt1 = "अभी राखी आ रही है तो मेरे बिजनेस के लिए एक promotional post बना दो";
  assert.equal(classifySocialCopilotIntent(hindiPrompt1), "PREPARE_CONTENT", "Hindi festive post request -> PREPARE_CONTENT");
  assert.equal(classifySocialPromptIntent(hindiPrompt1), "CREATIVE", "Hindi prompt intent -> CREATIVE");
  assert.equal(classifyCreativeRequestMode(hindiPrompt1, false), "EXECUTE", "Hindi explicit creation -> EXECUTE");

  const hindiPrompt2 = "मेरे बेकरी के लिए राखी का प्रमोशनल पोस्ट बना दो।";
  assert.equal(classifySocialCopilotIntent(hindiPrompt2), "PREPARE_CONTENT", "Hindi bakery post -> PREPARE_CONTENT");

  const hindiWeekPlan = "इस हफ्ते का प्लान बना दो";
  assert.equal(classifySocialCopilotIntent(hindiWeekPlan), "PREPARE_WEEK_PLAN", "Hindi week plan -> PREPARE_WEEK_PLAN");

  const hindiShow = "पोस्ट्स दिखाओ";
  assert.equal(classifySocialCopilotIntent(hindiShow), "SHOW_VARIANTS", "Hindi show posts -> SHOW_VARIANTS");

  const hindiPostNow = "अभी पोस्ट कर दो";
  assert.equal(classifySocialCopilotIntent(hindiPostNow), "POST_NOW_REQUEST", "Hindi post now -> POST_NOW_REQUEST");

  // -------------------------------------------------------------------------
  // 3. Hinglish & Romanized Hindi Intent & Mode Classification
  // -------------------------------------------------------------------------
  const hinglishPrompt1 = "Rakhi ke liye mere salon ke liye ek offer post bana do";
  assert.equal(classifySocialCopilotIntent(hinglishPrompt1), "PREPARE_CONTENT", "Hinglish salon offer -> PREPARE_CONTENT");
  assert.equal(classifyCreativeRequestMode(hinglishPrompt1, false), "EXECUTE", "Hinglish explicit creation -> EXECUTE");

  const romanHindiPrompt = "Mere bakery ke liye Diwali ka poster bana do";
  assert.equal(classifySocialCopilotIntent(romanHindiPrompt), "PREPARE_CONTENT", "Roman Hindi bakery poster -> PREPARE_CONTENT");
  assert.equal(classifyCreativeRequestMode(romanHindiPrompt, false), "EXECUTE", "Roman Hindi poster -> EXECUTE");

  const mixedPrompt = "Mere business ke liye ek premium looking Independence Day post bana do, Hindi mein";
  assert.equal(classifySocialCopilotIntent(mixedPrompt), "PREPARE_CONTENT", "Mixed language Independence Day post -> PREPARE_CONTENT");

  const exploratoryPrompt = "Aaj kuch post karna hai, mere business ke liye kya bana sakte ho?";
  assert.equal(classifyCreativeRequestMode(exploratoryPrompt, false), "EXPLORE", "Exploratory prompt -> EXPLORE");

  const schedulePrompt = "Ye post Instagram pe kal shaam ko daal do";
  assert.equal(classifySocialCopilotIntent(schedulePrompt), "FUTURE_SCHEDULE_REQUEST", "Future schedule in Hinglish -> FUTURE_SCHEDULE_REQUEST");

  const analyticsPrompt = "Mera last post kaisa perform kiya?";
  assert.equal(classifySocialPromptIntent(analyticsPrompt), "LOCAL_PLATFORM_DATA", "Hinglish analytics query -> LOCAL_PLATFORM_DATA");

  const brandQuery = "Meri brand ki tone kya hai?";
  assert.equal(classifySocialPromptIntent(brandQuery), "GENERAL", "Hinglish brand query -> GENERAL");

  // -------------------------------------------------------------------------
  // 4. Conversational Spelling & Colloquial Variations
  // -------------------------------------------------------------------------
  const variations = [
    "poster bna do",
    "post bnado",
    "offer post bana do",
    "post bana",
    "raksha bandhan ka post bana do",
    "diwali poster bna do",
    "post taiyar kar do",
  ];
  for (const v of variations) {
    assert.equal(classifySocialCopilotIntent(v), "PREPARE_CONTENT", `Variation '${v}' -> PREPARE_CONTENT`);
  }

  // -------------------------------------------------------------------------
  // 5. Follow-up & Revisions in Hindi / Hinglish
  // -------------------------------------------------------------------------
  const reviseHindi = "Isko Hindi mein kar do";
  assert.equal(classifySocialCopilotIntent(reviseHindi), "REVISE_CURRENT_ARTIFACT", "Language switch -> REVISE_CURRENT_ARTIFACT");

  const revisePremium = "Thoda premium bana do";
  assert.equal(classifySocialCopilotIntent(revisePremium), "REVISE_CURRENT_ARTIFACT", "Tone revision -> REVISE_CURRENT_ARTIFACT");

  const reviseCaption = "Caption Hindi mein rakho";
  assert.equal(classifySocialCopilotIntent(reviseCaption), "REVISE_CURRENT_ARTIFACT", "Caption language change -> REVISE_CURRENT_ARTIFACT");

  const reviseDevanagari = "इसे हिंदी में बदलो";
  assert.equal(classifySocialCopilotIntent(reviseDevanagari), "REVISE_CURRENT_ARTIFACT", "Devanagari revision -> REVISE_CURRENT_ARTIFACT");

  // -------------------------------------------------------------------------
  // 6. Image & Poster Generation Language Context
  // -------------------------------------------------------------------------
  const hindiImagePrompt = buildProviderReadyImagePrompt({
    brief: "राखी के लिए स्पेशल मिठाई बॉक्स का आकर्षक पोस्टर",
    intendedUse: "social_post",
    aspectRatio: "1:1",
    language: "Hindi",
    brandContext: {
      business_name: "रॉयल स्वीट्स (Royal Sweets)",
      industry: "Sweets & Bakery",
      tone_of_voice: ["पारंपरिक", "प्रीमियम", "विश्वसनीय"],
    },
  });
  assert.ok(hindiImagePrompt.includes("Creative brief: राखी के लिए स्पेशल मिठाई बॉक्स का आकर्षक पोस्टर"), "Hindi brief preserved");
  assert.ok(hindiImagePrompt.includes("Language / Cultural Context: Hindi"), "Language context preserved in image prompt");
  assert.ok(hindiImagePrompt.includes("Business: रॉयल स्वीट्स (Royal Sweets)"), "Brand context preserved in image prompt");

  // -------------------------------------------------------------------------
  // 7. Brand Trust Hard Gate Multilingual Preservation
  // -------------------------------------------------------------------------
  const safeHindiCaption = "इस रक्षाबंधन पर अपने परिवार को दीजिए शुद्ध देसी घी की मिठाइयों की मिठास। आज ही ऑर्डर करें!";
  const trustPass = evaluateBrandTrustHardGate({
    caption: safeHindiCaption,
    blockedPhrases: ["zero manual errors"],
    forbiddenClaims: ["100% guaranteed profit"],
  });
  assert.equal(trustPass.decision, "PASS", "Safe Hindi caption passes Brand Trust Hard Gate");

  const blockedHindiCaption = "इस रक्षाबंधन पर 100% guaranteed profit के साथ मिठाई खरीदें!";
  const trustBlock = evaluateBrandTrustHardGate({
    caption: blockedHindiCaption,
    forbiddenClaims: ["100% guaranteed profit"],
  });
  assert.equal(trustBlock.decision, "BLOCK", "Forbidden claims in Hindi/English mix are blocked by Brand Trust Hard Gate");

  // -------------------------------------------------------------------------
  // 8. Sanitization Preserves Multilingual Text
  // -------------------------------------------------------------------------
  const rawHindiOutput = "मैंने आपके बेकरी के लिए रक्षाबंधन का स्पेशल पोस्ट तैयार कर दिया है।\nmaster id: a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d\nकृपया नीचे अप्रूव करें।";
  const sanitized = sanitizeUserFacingText(rawHindiOutput);
  assert.ok(sanitized.includes("मैंने आपके बेकरी के लिए रक्षाबंधन का स्पेशल पोस्ट तैयार कर दिया है।"), "Hindi text untouched by sanitizer");
  assert.ok(sanitized.includes("कृपया नीचे अप्रूव करें।"), "Closing Hindi text untouched");
  assert.ok(!sanitized.includes("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"), "Internal UUID redacted");
  assert.ok(!sanitized.includes("master id:"), "Internal metadata label redacted");

  console.log("multilingual-copilot.test.ts: ALL PASS (Hindi, Hinglish, Romanized Hindi, Live Bug Test Cases, Revisions, Image Generation, Trust Gate, Sanitization)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
