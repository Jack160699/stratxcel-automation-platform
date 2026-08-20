/**
 * Customer-Facing Smart Website Creation Experience Test Suite
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  smartWebsiteCreatorController,
  type CreatorSessionState,
} from "../creator/index.ts";
import type { AuthorizedConnectorContext } from "../brief/types.ts";

describe("Customer-Facing Smart Website Creator Experience", () => {
  const tenantId = "tenant_smb_delhi_101";
  const projectId = "proj_smb_site_101";

  const richConnectorContext: AuthorizedConnectorContext = {
    brandBrain: {
      businessName: "Royal Heritage Sweets",
      logoUrl: "https://assets.stratxcel.test/royal_logo.webp",
      tagline: "Authentic Delicacies since 1984",
      primaryColor: "#c29b38",
      industry: "Confectionery & Mithai",
    },
    analytics: {
      connected: true,
      mobileTrafficPercentage: 88,
      topPages: [
        { path: "/", views: 1200 },
        { path: "/menu", views: 800 },
        { path: "/contact", views: 400 },
      ],
      topTrafficSources: ["google.com", "instagram.com"],
    },
    searchConsole: {
      connected: true,
      topQueries: ["best gulab jamun delhi", "royal heritage sweets online order"],
    },
    catalog: {
      existingProducts: [
        { title: "Kaju Katli Box 500g", priceCents: 65000 },
        { title: "Signature Motichoor Ladoo 1kg", priceCents: 52000 },
      ],
    },
  };

  it("1. Multilingual Input (Hindi): 'मेरी कपड़ों की दुकान है, प्रीमियम वेबसाइट बना दो।'", () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
    });

    assert.equal(initialState.step, "INPUT");
    assert.equal(initialState.completionPercentage, 0);

    const step1 = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "मेरी कपड़ों की दुकान है, प्रीमियम वेबसाइट बना दो।",
      "hindi"
    );

    assert.equal(step1.step, "QUESTIONS");
    assert.equal(step1.detectedLanguage, "hi");
    assert.equal(step1.selectedLanguage, "hindi");
    assert.ok(step1.questions.length > 0, "Should generate smart dynamic questions");
    assert.equal(step1.canResume, true);
    assert.ok(step1.completionPercentage >= 25);
  });

  it("2. Multilingual Input (Hinglish): 'Meri clothing shop hai, premium website chahiye jo WhatsApp enquiry motivate kare.'", () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
    });

    const step1 = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "Meri clothing shop hai, premium website chahiye jo WhatsApp enquiry motivate kare.",
      "bilingual"
    );

    assert.equal(step1.step, "QUESTIONS");
    assert.equal(step1.detectedLanguage, "hinglish");
    assert.equal(step1.selectedLanguage, "bilingual");

    // Check that WhatsApp goal is already inferred so it doesn't repeatedly ask
    const hasGoalQuestion = step1.questions.some((q) => q.id === "q_goal");
    assert.equal(hasGoalQuestion, false, "Should skip goal question when already clear in Hinglish prompt");
  });

  it("3. Connector-Rich Context & Known Fields (Zero-Question Flow)", () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
      connectorContext: richConnectorContext,
    });

    assert.ok(initialState.connectorChips.length >= 3);
    assert.ok(initialState.knownFields.some((k) => k.label === "Business Name"));
    assert.ok(initialState.knownFields.some((k) => k.label === "Logo"));

    // Customer provides complete intent given connector context
    const step1 = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "Modern luxury mithai store with online delivery and WhatsApp ordering.",
      "english"
    );

    // Should transition directly to SUMMARY without asking redundant questions
    assert.equal(step1.step, "SUMMARY");
    assert.ok(step1.summary);
    assert.equal(step1.summary.brandName, "Royal Heritage Sweets");
    assert.ok(
      step1.summary.primaryGoal.includes("WHATSAPP") || step1.summary.primaryGoal.includes("ORDERS"),
      "Should capture WhatsApp/Orders goal"
    );
    assert.ok(step1.completionPercentage >= 75);
  });

  it("4. Dynamic Step-by-Step Question Answering & 'Other' Custom Text", () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
    });

    let state = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "Need a website for my consulting business.",
      "english"
    );

    assert.equal(state.step, "QUESTIONS");
    const totalQ = state.questions.length;
    assert.ok(totalQ >= 2);

    // Answer Question 1 via selected option button
    const q1 = state.questions[0];
    state = smartWebsiteCreatorController.answerQuestion(state, {
      questionId: q1.id,
      selectedOptionId: q1.options[0].value,
    });

    assert.equal(state.currentQuestionIndex, 1);
    assert.ok(state.completionPercentage > 25);

    // Answer Question 2 via custom text
    const q2 = state.questions[1];
    state = smartWebsiteCreatorController.answerQuestion(state, {
      questionId: q2.id,
      customText: "High net-worth corporate leaders and venture-backed founders",
    });

    // Answer remaining questions if any
    while (state.step === "QUESTIONS" && state.currentQuestionIndex < state.questions.length) {
      const curQ = state.questions[state.currentQuestionIndex];
      state = smartWebsiteCreatorController.answerQuestion(state, {
        questionId: curQ.id,
        selectedOptionId: curQ.options[0]?.value,
      });
    }

    assert.equal(state.step, "SUMMARY");
    assert.ok(state.summary);
    assert.ok(state.brief);
  });

  it("5. Website Generation & 8-Stage Friendly Progress", async () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
      connectorContext: richConnectorContext,
    });

    const readyForGen = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "Royal Heritage Sweets luxury mithai website.",
      "english"
    );

    assert.equal(readyForGen.step, "SUMMARY");

    const result = await smartWebsiteCreatorController.generateWebsite(readyForGen);

    assert.equal(result.step, "READY");
    assert.ok(result.generatedSite);
    assert.equal(result.generatedSite.version, 1);
    assert.equal(result.generatedSite.siteModel.pages.length, 5);
    assert.equal(result.completionPercentage, 100);

    // Stages completed
    assert.equal(result.stages.length, 8);
    assert.ok(result.stages.every((s) => s.isComplete));
  });

  it("6. Resume Flow for In-Progress Setup", () => {
    const savedState: Partial<CreatorSessionState> = {
      sessionId: "sess_resume_123",
      tenantId,
      projectId,
      step: "QUESTIONS",
      currentQuestionIndex: 2,
      initialMessage: "Clothing store website",
      detectedLanguage: "en",
      selectedLanguage: "english",
      answers: [{ questionId: "q_name", customText: "Aura Boutique" }],
      questions: [
        { id: "q_name", title: "Business Name?", fieldKey: "businessName", options: [], allowCustomText: true, isRequired: true },
        { id: "q_goal", title: "Main Goal?", fieldKey: "primaryGoal", options: [{ id: "o1", label: "WhatsApp", value: "WHATSAPP" }], allowCustomText: true, isRequired: true },
        { id: "q_style", title: "Style?", fieldKey: "visualStyle", options: [{ id: "o2", label: "Luxury", value: "PREMIUM_LUXURY" }], allowCustomText: true, isRequired: true },
      ],
      completionPercentage: 65,
      canResume: true,
      lastSavedAt: new Date().toISOString(),
    };

    const resumed = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
      savedState,
    });

    assert.equal(resumed.canResume, true);
    assert.equal(resumed.step, "QUESTIONS");
    assert.equal(resumed.currentQuestionIndex, 2);
    assert.equal(resumed.completionPercentage, 65);
    assert.equal(resumed.answers.length, 1);
  });

  it("7. Safe Versioned Regeneration (v1 -> v2)", async () => {
    const initialState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
      connectorContext: richConnectorContext,
    });

    const summaryState = smartWebsiteCreatorController.submitInitialMessage(
      initialState,
      "Royal Heritage Sweets store",
      "english"
    );

    const v1State = await smartWebsiteCreatorController.generateWebsite(summaryState);
    assert.equal(v1State.generatedSite?.version, 1);

    // Regenerate to Editorial Minimal look
    const v2State = await smartWebsiteCreatorController.executeRegeneration(v1State, {
      action: "change_style",
      newStyle: "EDITORIAL_MINIMAL",
      customInstruction: "Make typography sharper and add generous white space",
    });

    assert.equal(v2State.step, "READY");
    assert.equal(v2State.generatedSite?.version, 2, "Should increment to version 2");
    assert.equal(v2State.brief?.visualStyle.value, "EDITORIAL_MINIMAL");
    // Business identity preserved
    assert.equal(v2State.brief?.businessName.value, "Royal Heritage Sweets");
  });

  it("8. Resilient Error Handling (Fail-Safe on Missing Brief)", async () => {
    const brokenState = smartWebsiteCreatorController.initializeSession({
      tenantId,
      projectId,
    });

    const errorResult = await smartWebsiteCreatorController.generateWebsite(brokenState);

    assert.equal(errorResult.step, "ERROR");
    assert.ok(errorResult.error);
    assert.match(errorResult.error, /one more detail/i);
  });
});
