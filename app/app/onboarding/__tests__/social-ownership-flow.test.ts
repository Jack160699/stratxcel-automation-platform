import assert from "node:assert/strict";
import { validateAndNormalizeSocialInput } from "../../../../lib/identity/social-normalizer.ts";

function run() {
  console.log("Running Social Ownership Normalization & Validation Tests...");

  // 1. Instagram Normalization
  {
    const r1 = validateAndNormalizeSocialInput("instagram", "@stratxcel.ai");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "@stratxcel.ai");
      assert.equal(r1.data.url, "https://www.instagram.com/stratxcel.ai/");
    }

    const r2 = validateAndNormalizeSocialInput("instagram", "https://instagram.com/stratxcel.ai/");
    assert.equal(r2.success, true);
    if (r2.success) {
      assert.equal(r2.data.handle, "@stratxcel.ai");
      assert.equal(r2.data.url, "https://www.instagram.com/stratxcel.ai/");
    }

    const r3 = validateAndNormalizeSocialInput("instagram", "stratxcel.ai");
    assert.equal(r3.success, true);
    if (r3.success) {
      assert.equal(r3.data.handle, "@stratxcel.ai");
    }
  }

  // 2. YouTube Normalization
  {
    const r1 = validateAndNormalizeSocialInput("youtube", "@StratxcelSolutions");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "@StratxcelSolutions");
      assert.equal(r1.data.url, "https://www.youtube.com/@StratxcelSolutions");
    }

    const r2 = validateAndNormalizeSocialInput("youtube", "https://www.youtube.com/@StratxcelSolutions");
    assert.equal(r2.success, true);
    if (r2.success) {
      assert.equal(r2.data.handle, "@StratxcelSolutions");
      assert.equal(r2.data.url, "https://www.youtube.com/@StratxcelSolutions");
    }
  }

  // 3. Threads Normalization
  {
    const r1 = validateAndNormalizeSocialInput("threads", "@stratxcel.ai");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "@stratxcel.ai");
      assert.equal(r1.data.url, "https://www.threads.net/@stratxcel.ai");
    }

    const r2 = validateAndNormalizeSocialInput("threads", "https://www.threads.net/@stratxcel.ai");
    assert.equal(r2.success, true);
    if (r2.success) {
      assert.equal(r2.data.handle, "@stratxcel.ai");
      assert.equal(r2.data.url, "https://www.threads.net/@stratxcel.ai");
    }
  }

  // 4. LinkedIn Normalization
  {
    const r1 = validateAndNormalizeSocialInput("linkedin", "https://www.linkedin.com/company/107894380/");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "107894380");
      assert.equal(r1.data.url, "https://www.linkedin.com/company/107894380/");
    }

    const r2 = validateAndNormalizeSocialInput("linkedin", "stratxcel");
    assert.equal(r2.success, true);
    if (r2.success) {
      assert.equal(r2.data.handle, "stratxcel");
      assert.equal(r2.data.url, "https://www.linkedin.com/company/stratxcel/");
    }
  }

  // 5. Facebook Normalization
  {
    const r1 = validateAndNormalizeSocialInput("facebook", "https://www.facebook.com/share/1ZfjUR2RTS/");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "@1ZfjUR2RTS");
      assert.equal(r1.data.url, "https://www.facebook.com/share/1ZfjUR2RTS/");
    }

    const r2 = validateAndNormalizeSocialInput("facebook", "StratXcel Official");
    assert.equal(r2.success, true);
    if (r2.success) {
      assert.equal(r2.data.handle, "@StratXcel Official");
    }
  }

  // 6. WhatsApp Normalization
  {
    const r1 = validateAndNormalizeSocialInput("whatsapp", "+91-77778-12777");
    assert.equal(r1.success, true);
    if (r1.success) {
      assert.equal(r1.data.handle, "+917777812777");
      assert.equal(r1.data.url, "https://wa.me/917777812777");
    }
  }

  // 7. Error Cases & Guardrails
  {
    const e1 = validateAndNormalizeSocialInput("instagram", "");
    assert.equal(e1.success, false);

    const e2 = validateAndNormalizeSocialInput("whatsapp", "not-a-number");
    assert.equal(e2.success, false);

    const e3 = validateAndNormalizeSocialInput("youtube", "@invalid spaces/chars");
    assert.equal(e3.success, false);
  }

  console.log("social-ownership-flow.test.ts: ALL PASS");
}

run();
