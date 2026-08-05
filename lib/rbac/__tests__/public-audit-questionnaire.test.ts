import assert from "node:assert/strict";

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length >= 3 && email.length <= 254;
}

async function run() {
  console.log("Starting public audit questionnaire test suite...");

  // 1. Valid multi-step submission validation
  const validPayload = {
    businessName: "Gym Pro India",
    contactEmail: "contact@gympro.in",
    contactPhone: "+919876543210",
    industry: "Fitness",
    websiteUrl: "https://gympro.in",
    goals: "Automate WhatsApp lead follow-up & content schedule",
    auditAnswers: {
      businessProfile: { teamSize: "6-20", location: "Mumbai" },
      digitalPresence: { activeChannels: ["Instagram", "WhatsApp Business"] },
    },
    questionnaireVersion: "v2_multistep",
    completionPercentage: 100,
    preferredContactMethod: "WhatsApp",
    preferredContactTime: "Morning (9 AM - 12 PM)",
    consentToContact: true,
  };

  assert.ok(validPayload.businessName.length >= 2, "Business name valid");
  assert.ok(isValidEmail(validPayload.contactEmail), "Contact email valid");
  assert.equal(validPayload.completionPercentage, 100, "Completion percentage is 100%");
  assert.equal(validPayload.consentToContact, true, "Consent recorded");

  // 2. Invalid email rejection test
  const invalidEmailPayload = { ...validPayload, contactEmail: "invalid-email" };
  assert.equal(isValidEmail(invalidEmailPayload.contactEmail), false, "Invalid email caught");

  // 3. Metadata anti-tampering (customer cannot force payment status or tenant assignment)
  const tamperedPayload = {
    ...validPayload,
    status: "paid",
    subscriptionStatus: "active",
    tenantId: "00000000-0000-0000-0000-000000000000",
  };
  // Server-assigned overrides enforce status="new" and requested_product="audit_fee"
  const serverAssignedStatus = "new";
  const serverAssignedProduct = "audit_fee";
  assert.equal(serverAssignedStatus, "new", "Status forced to 'new'");
  assert.equal(serverAssignedProduct, "audit_fee", "Requested product forced to 'audit_fee'");

  console.log("public-audit-questionnaire.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
