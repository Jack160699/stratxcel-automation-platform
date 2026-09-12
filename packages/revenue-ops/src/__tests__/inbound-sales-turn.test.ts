import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WhatsAppSalesEngine } from "../whatsapp-sales-engine.ts";

describe("Real Inbound WhatsApp → Hermes Revenue Brain → Sales Agent Turn Verification", () => {
  const salesEngine = new WhatsAppSalesEngine();
  const leadId = "lead_test_unknown_001";
  const tenantId = "466e6195-a9f6-4576-8271-29fdae61c18a";

  let leadMetadata: Record<string, unknown> = {};

  it("Turn 1: 'Hi, what do you do?' -> Real Hermes sales response (NOT canned)", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "Hi, what do you do?",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.detectedState, "CURIOUS");
    assert.equal(turn.detectedLanguage, "english");
    // Verify it is NOT the canned response
    assert.ok(!turn.replyText.includes("Someone from our team will get back to you"));
    assert.ok(!turn.replyText.includes("Thanks for reaching out"));
    // Verify it IS a consultative Hermes sales response
    assert.ok(turn.replyText.includes("websites") && turn.replyText.includes("Google Maps") && turn.replyText.includes("What kind of business"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 2: 'I run a gym.' -> Business context extracted and diagnosed", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "I run a gym.",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.extractedFacts.businessCategory, "gym_fitness");
    assert.ok(!turn.replyText.includes("Someone from our team"));
    // Asks useful diagnostic question about website and customer acquisition
    assert.ok(turn.replyText.toLowerCase().includes("gym") || turn.replyText.toLowerCase().includes("fitness"));
    assert.ok(turn.replyText.includes("website"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 3: 'I already have a website.' -> Business diagnosis forbids duplicate website pitch", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "I already have a website.",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.extractedFacts.hasWebsite, true);
    assert.equal(turn.extractedFacts.businessCategory, "gym_fitness");
    // Explicitly avoids pitching duplicate website
    assert.ok(turn.replyText.includes("redundant") || turn.replyText.includes("already active") || turn.replyText.includes("not the priority"));
    assert.ok(turn.replyText.includes("Google Maps"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 4: 'I need more customers.' -> Recommends appropriate local acquisition service", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "I need more customers.",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.extractedFacts.primaryGoal, "more_customers");
    assert.ok(turn.replyText.includes("Google Business") || turn.replyText.includes("Google Maps"));
    assert.ok(turn.replyText.includes("₹3,000"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 5: 'How much?' -> Strict canonical pricing delivered", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "How much?",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.detectedState, "PRICE_FOCUSED");
    // Canonical rates must be present
    assert.ok(turn.replyText.includes("₹3,000"));
    assert.ok(turn.replyText.includes("₹3,500"));
    assert.ok(turn.replyText.includes("₹5,000"));
    assert.ok(turn.replyText.includes("3-month minimum commitment"));
    // Zero invented discounts
    assert.ok(!turn.replyText.includes("discount") && !turn.replyText.includes("special deal"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 6: Hindi inquiry -> Naturally replies in Hindi with canonical pricing", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId: "lead_hindi",
      inboundText: "नमस्ते, वेबसाइट और गूगल मैप्स का कितना चार्ज है?",
      leadContext: {
        contactPhone: "919999999999",
        metadata: {},
      },
    });

    assert.equal(turn.detectedLanguage, "hindi");
    assert.ok(turn.replyText.includes("₹3,000"));
    assert.ok(turn.replyText.includes("Google Maps") || turn.replyText.includes("गूगल मैप्स"));
  });

  it("Turn 7: Hinglish inquiry -> Naturally replies in Hinglish", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId: "lead_hinglish",
      inboundText: "Bhai kya pricing hai aur setup me kitna time lagega?",
      leadContext: {
        contactPhone: "919999999998",
        metadata: {},
      },
    });

    assert.equal(turn.detectedLanguage, "hinglish");
    assert.ok(turn.replyText.includes("₹3,000"));
  });

  it("Turn 8: Hesitation 'Seems expensive.' -> Natural consultative objection handling", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "Seems expensive.",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.detectedState, "HESITANT");
    assert.ok(turn.replyText.includes("understand") || turn.replyText.includes("lock-in"));
    assert.ok(turn.replyText.includes("₹3,000"));
    leadMetadata = turn.updatedLeadMetadata;
  });

  it("Turn 9: 'I'll think about it.' -> Polite non-spam response", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId,
      inboundText: "I'll think about it.",
      leadContext: {
        contactPhone: "916267979780",
        metadata: leadMetadata,
      },
    });

    assert.equal(turn.detectedState, "BUSY");
    assert.ok(turn.replyText.includes("Take your time") || turn.replyText.includes("no pressure"));
    assert.ok(turn.nextFollowUpDelayHours >= 48);
  });

  it("Turn 10: Optical shop with no website -> Recommends Google Maps + Website", () => {
    const turn = salesEngine.processInboundTurn({
      tenantId,
      leadId: "lead_optical",
      inboundText: "I have an optical shop in Raipur. What can you do for me?",
      leadContext: {
        contactPhone: "919876543210",
        metadata: {},
      },
    });

    assert.equal(turn.extractedFacts.businessCategory, "optical_shop");
    assert.ok(turn.replyText.toLowerCase().includes("optical"));
  });
});
