// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/otp.test.ts
import assert from "node:assert/strict";
import {
  normalizePhoneNumberE164,
  getMetaPhoneDigits,
  maskPhoneNumber,
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  META_AUTHENTICATION_TEMPLATE_NAME,
  META_AUTHENTICATION_TEMPLATE_LANG,
  sendMetaAuthenticationOtp,
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  updateWhatsAppOtpDeliveryStatus,
  getWhatsAppOtpDeliveryStatus,
  RESEND_COOLDOWN_MS,
  MAX_VERIFICATION_ATTEMPTS,
} from "../otp.ts";

console.log("Running StratXcel WhatsApp OTP Test Suite...");

// --- 1. Phone Normalization & E.164 Tests ---
{
  assert.equal(normalizePhoneNumberE164("9876543210"), "+919876543210", "Bare 10 digits defaults to +91");
  assert.equal(normalizePhoneNumberE164("09876543210"), "+919876543210", "0-prefixed 11 digits normalizes to +91");
  assert.equal(normalizePhoneNumberE164("+91 98765 43210"), "+919876543210", "Spaces stripped properly");
  assert.equal(normalizePhoneNumberE164("+91-98765-43210"), "+919876543210", "Dashes stripped properly");
  assert.equal(normalizePhoneNumberE164("919876543210"), "+919876543210", "12-digit 91 prefix normalizes with leading +");
  assert.equal(normalizePhoneNumberE164("+14155552671"), "+14155552671", "US international number preserves country code");
  assert.equal(normalizePhoneNumberE164("+447911123456"), "+447911123456", "UK international number preserves country code");

  // Invalid formats return null
  assert.equal(normalizePhoneNumberE164("123"), null, "Too short returns null");
  assert.equal(normalizePhoneNumberE164("abcdefghij"), null, "Non-digits returns null");
  assert.equal(normalizePhoneNumberE164(""), null, "Empty string returns null");
  console.log("✓ Phone normalization tests passed");
}

// --- 2. Meta Phone Digits Extraction ---
{
  assert.equal(getMetaPhoneDigits("+919876543210"), "919876543210", "Strips leading + for Meta API");
  assert.equal(getMetaPhoneDigits("+14155552671"), "14155552671", "Strips leading + for US numbers");
  console.log("✓ Meta phone digits extraction tests passed");
}

// --- 3. Phone Masking Tests ---
{
  assert.equal(maskPhoneNumber("+919876543210"), "+9198 •••• •210", "Masks middle digits safely");
  assert.equal(maskPhoneNumber("9876543210"), "+9198 •••• •210", "Masks normalized bare number safely");
  console.log("✓ Phone masking tests passed");
}

// --- 4. Secure OTP Generation Tests ---
{
  for (let i = 0; i < 50; i++) {
    const otp = generateSecureOtp();
    assert.equal(typeof otp, "string", "OTP is a string");
    assert.equal(otp.length, 6, "OTP is exactly 6 digits");
    assert.ok(/^\d{6}$/.test(otp), "OTP consists exclusively of digits");
    const num = Number.parseInt(otp, 10);
    assert.ok(num >= 100000 && num <= 999999, "OTP is within 100000..999999 range");
  }
  console.log("✓ Secure OTP generation tests passed");
}

// --- 5. Timing-safe HMAC Hashing Tests ---
{
  const phone = "+919876543210";
  const otp = "849201";
  const secret = "test-secret-salt-key-2026";

  const hash1 = hashOtp(phone, otp, secret);
  const hash2 = hashOtp(phone, otp, secret);
  assert.equal(hash1, hash2, "Hashing is deterministic with same key and inputs");

  // Hash verification
  assert.equal(verifyOtpHash(phone, "849201", hash1, secret), true, "Matches correct OTP");
  assert.equal(verifyOtpHash(phone, "123456", hash1, secret), false, "Rejects wrong OTP");
  assert.equal(verifyOtpHash("+919999999999", "849201", hash1, secret), false, "Rejects wrong phone");
  assert.equal(verifyOtpHash(phone, "84920", hash1, secret), false, "Rejects malformed OTP length");
  assert.equal(verifyOtpHash(phone, "849201a", hash1, secret), false, "Rejects non-numeric OTP");
  console.log("✓ Timing-safe HMAC hashing tests passed");
}

// --- 6. Meta Authentication Template Contract ---
{
  assert.equal(META_AUTHENTICATION_TEMPLATE_NAME, "stratxcel_login_otp", "Uses stratxcel_login_otp template");
  assert.equal(META_AUTHENTICATION_TEMPLATE_LANG, "en_US", "Uses en_US language");

  // Verify mock sender receives exact parameters
  let capturedPayload: any = null;
  await sendMetaAuthenticationOtp({
    toPhoneDigits: "919876543210",
    otpCode: "654321",
    mockSender: async (p) => {
      capturedPayload = p;
      return { ok: true, messageId: "wamid.test_payload_123" };
    },
  });

  assert.ok(capturedPayload, "mockSender captured payload");
  assert.equal(capturedPayload.to, "919876543210");
  assert.equal(capturedPayload.otp, "654321");

  const components = capturedPayload.payload.template.components;
  const bodyComponent = components.find((c: any) => c.type === "body");
  const buttonComponent = components.find((c: any) => c.type === "button");

  assert.ok(bodyComponent, "body component exists");
  assert.equal(bodyComponent.parameters?.[0]?.type, "text", "body parameter type = text");
  assert.equal(bodyComponent.parameters?.[0]?.text, "654321", "body parameter has OTP code");

  assert.ok(buttonComponent, "button component exists");
  assert.equal(buttonComponent.sub_type, "url", "button subtype = url");
  assert.equal(buttonComponent.index, 0, "button index = 0");
  assert.equal(buttonComponent.parameters?.[0]?.type, "text", "button parameter type = text");
  assert.equal(buttonComponent.parameters?.[0]?.text, "654321", "button parameter value === body OTP");
  assert.equal(buttonComponent.parameters?.[0]?.text, bodyComponent.parameters?.[0]?.text, "button and body use identical generated OTP");

  console.log("✓ Meta Authentication template contract verified");
}

// Shared in-memory mock Supabase client factory (whatsapp_otp_verifications
// shape only) -- used by Test 7 (existing) and Test 8 (delivery-status
// correlation, new).
function createMockOtpSupabase(mockRows: any[]): any {
  return {
    from: (tableName: string) => {
      assert.equal(tableName, "whatsapp_otp_verifications");
      const queryFilter: Record<string, any> = {};
      let isNullFilter: string | null = null;
      const updateFilters: Record<string, any> = {};
      let updateIsNullCol: string | null = null;
      let pendingUpdates: any = null;

      const applyUpdate = () => {
        if (!pendingUpdates) return;
        for (const r of mockRows) {
          let matches = true;
          for (const [k, v] of Object.entries(updateFilters)) {
            if (r[k] !== v) {
              matches = false;
              break;
            }
          }
          if (updateIsNullCol && r[updateIsNullCol] != null) {
            matches = false;
          }
          if (matches) {
            Object.assign(r, pendingUpdates);
          }
        }
      };

      const updateBuilder: any = {
        eq: (col: string, val: any) => {
          updateFilters[col] = val;
          applyUpdate();
          return updateBuilder;
        },
        is: (col: string, val: any) => {
          if (val === null) updateIsNullCol = col;
          applyUpdate();
          return updateBuilder;
        },
        then: (resolve: any) => {
          applyUpdate();
          resolve({ error: null });
        },
      };

      const builder: any = {
        select: (cols: string, opts?: any) => builder,
        eq: (col: string, val: any) => {
          queryFilter[col] = val;
          return builder;
        },
        is: (col: string, val: any) => {
          if (val === null) isNullFilter = col;
          return builder;
        },
        gte: (col: string, val: any) => builder,
        order: (col: string, opts: any) => builder,
        limit: (n: number) => builder,
        maybeSingle: async () => {
          const matched = mockRows.filter((r) => {
            for (const [k, v] of Object.entries(queryFilter)) {
              if (r[k] !== v) return false;
            }
            if (isNullFilter && r[isNullFilter] != null) return false;
            return true;
          });
          return { data: matched[matched.length - 1] || null, error: null };
        },
        then: (resolve: any) => {
          const matched = mockRows.filter((r) => {
            for (const [k, v] of Object.entries(queryFilter)) {
              if (r[k] !== v) return false;
            }
            if (isNullFilter && r[isNullFilter] != null) return false;
            return true;
          });
          resolve({ data: matched, count: matched.length, error: null });
        },
        insert: async (row: any) => {
          const newRow = { id: `mock_id_${mockRows.length + 1}`, created_at: new Date().toISOString(), ...row };
          mockRows.push(newRow);
          return { data: newRow, error: null };
        },
        update: (updates: any) => {
          pendingUpdates = updates;
          return updateBuilder;
        },
      };
      return builder;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { user_metadata: {} } } }),
        updateUserById: async () => ({ error: null }),
      },
    },
  };
}

// --- 7. In-Memory Mock Database & End-to-End Service Lifecycle Tests ---
{
  const mockRows: any[] = [];
  const mockSupabase: any = createMockOtpSupabase(mockRows);

  const testPhone = "+919876543210";
  const testSecret = "unit-test-secret-salt-2026";

  // Step 0: Fail-closed verification — Unconfigured credentials MUST fail without mockSender
  const unconfiguredRes = await sendWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    purpose: "onboarding_verification",
    secret: testSecret,
  });
  assert.equal(unconfiguredRes.ok, false, "Unconfigured credentials must fail closed");
  assert.ok(unconfiguredRes.error?.includes("credentials not configured"), "Error message specifies missing credentials");
  assert.equal(mockRows.length, 0, "No records inserted on failed send");

  // Step 1: Send OTP with mock sender
  const sendRes = await sendWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    purpose: "onboarding_verification",
    secret: testSecret,
    mockSender: async () => ({ ok: true, messageId: "wamid.test_12345" }),
  });

  assert.equal(sendRes.ok, true, "sendWhatsAppOtp succeeds with mock sender");
  assert.equal(sendRes.normalizedPhone, "+919876543210");
  assert.equal(sendRes.maskedPhone, "+9198 •••• •210");
  assert.equal(sendRes.expiresInSeconds, 600, "10-minute expiration");
  assert.equal(mockRows.length, 1, "One record inserted into database");

  const inserted = mockRows[0];
  assert.equal(inserted.destination_phone, "+919876543210");
  assert.equal(inserted.consumed_at, undefined);
  assert.equal(inserted.attempt_count, 0);

  // Step 2: Resend cooldown check
  const cooldownRes = await sendWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    purpose: "onboarding_verification",
    secret: testSecret,
    mockSender: async () => ({ ok: true, messageId: "wamid.test_67890" }),
  });
  assert.equal(cooldownRes.ok, false, "Immediate resend rejected by cooldown");
  assert.equal(cooldownRes.errorCode, "COOLDOWN_ACTIVE");

  // Step 3: Verify wrong OTP increments attempt count
  const wrongRes = await verifyWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    otp: "000000",
    purpose: "onboarding_verification",
    secret: testSecret,
  });
  assert.equal(wrongRes.ok, false, "Wrong OTP fails verification");
  assert.equal(wrongRes.errorCode, "INVALID_OTP");
  assert.equal(wrongRes.attemptsLeft, 4, "4 attempts remaining");
  assert.equal(mockRows[0].attempt_count, 1, "Attempt count incremented in DB");

  // Step 4: Verify correct OTP succeeds and consumes record
  // Extract generated OTP by testing hash against all numbers (or verifying with the matching hash)
  let foundOtp = "";
  for (let candidate = 100000; candidate <= 999999; candidate++) {
    const candStr = String(candidate);
    if (hashOtp(testPhone, candStr, testSecret) === mockRows[0].otp_hash) {
      foundOtp = candStr;
      break;
    }
  }
  assert.ok(foundOtp.length === 6, "Found matching OTP for test");

  const correctRes = await verifyWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    otp: foundOtp,
    purpose: "onboarding_verification",
    secret: testSecret,
  });
  assert.equal(correctRes.ok, true, "Correct OTP successfully verified");
  assert.equal(correctRes.phone, testPhone);
  assert.ok(mockRows[0].consumed_at, "Record marked consumed_at in database");
  assert.equal(mockRows[0].outcome, "verified", "outcome is classified as verified, not left ambiguous like the previous metadata-only signal");

  // Step 5: Replay prevention — Verifying already consumed OTP fails
  const replayRes = await verifyWhatsAppOtp(mockSupabase, {
    phone: testPhone,
    otp: foundOtp,
    purpose: "onboarding_verification",
    secret: testSecret,
  });
  assert.equal(replayRes.ok, false, "Replay rejected — already consumed");
  assert.equal(replayRes.errorCode, "NOT_FOUND");

  console.log("✓ End-to-end service lifecycle & replay prevention tests passed");
}

// --- 8. Delivery-status webhook correlation + outcome classification ----
// (STRATXCEL PRODUCTION REPAIR mission, Section 3/13: real, provider-
// sourced delivery status was never tracked at all before this.)
{
  const mockRows: any[] = [];
  const mockSupabase: any = createMockOtpSupabase(mockRows);
  const phone = "+919812345678";
  const secret = "delivery-test-secret-2026";
  const userId = "user-alpha";

  const sendRes = await sendWhatsAppOtp(mockSupabase, {
    phone,
    userId,
    purpose: "onboarding_verification",
    secret,
    mockSender: async () => ({ ok: true, messageId: "wamid.delivery_test_1" }),
  });
  assert.equal(sendRes.ok, true);
  assert.equal(mockRows[0].delivery_status, "accepted", "delivery_status starts at accepted (provider-API-accepted, not yet confirmed delivered)");

  // A webhook event for an unknown message id must be a safe, explicit no-op.
  const unknownResult = await updateWhatsAppOtpDeliveryStatus(mockSupabase, { providerMessageId: "wamid.does_not_exist", status: "delivered" });
  assert.deepEqual(unknownResult, { success: true, updated: false, reason: "not_found" }, "an unmatched provider_message_id must never throw or silently create a row");

  // Real webhook event: accepted -> sent -> delivered.
  const sentResult = await updateWhatsAppOtpDeliveryStatus(mockSupabase, { providerMessageId: "wamid.delivery_test_1", status: "sent" });
  assert.equal(sentResult.updated, true);
  assert.equal(mockRows[0].delivery_status, "sent");

  const deliveredResult = await updateWhatsAppOtpDeliveryStatus(mockSupabase, { providerMessageId: "wamid.delivery_test_1", status: "delivered" });
  assert.equal(deliveredResult.updated, true);
  assert.equal(mockRows[0].delivery_status, "delivered");

  // Out-of-order redelivery (Meta's at-least-once delivery can redeliver an
  // older "sent" event after "delivered" already landed) must never regress
  // the status backwards.
  const staleResult = await updateWhatsAppOtpDeliveryStatus(mockSupabase, { providerMessageId: "wamid.delivery_test_1", status: "sent" });
  assert.deepEqual(staleResult, { success: true, updated: false, reason: "stale_status" }, "an out-of-order redelivered status must never regress delivery_status");
  assert.equal(mockRows[0].delivery_status, "delivered", "status stays at the more-advanced value after a stale redelivery");

  // The read-only status check the customer UI polls.
  const statusForOwner = await getWhatsAppOtpDeliveryStatus(mockSupabase, { phone, userId });
  assert.equal(statusForOwner.found, true);
  assert.equal(statusForOwner.deliveryStatus, "delivered", "the UI-facing read must see the real, webhook-confirmed status");
  assert.equal(statusForOwner.consumed, false);

  // Scoped to the requesting user only -- a different user's identical
  // phone-lookup attempt must never see this OTP's status.
  const statusForOtherUser = await getWhatsAppOtpDeliveryStatus(mockSupabase, { phone, userId: "user-beta" });
  assert.equal(statusForOtherUser.found, false, "OTP delivery status must never leak across users, even for the same phone number");

  console.log("✓ Test 8: delivery-status webhook correlation is rank-guarded, idempotent-safe, and user-scoped on read");
}

console.log("\n==========================================");
console.log("ALL WHATSAPP OTP TESTS PASSED SUCCESSFULLY");
console.log("==========================================");
