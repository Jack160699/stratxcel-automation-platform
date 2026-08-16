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
  console.log("✓ Meta Authentication template contract verified");
}

// --- 7. In-Memory Mock Database & End-to-End Service Lifecycle Tests ---
{
  const mockRows: any[] = [];
  const mockSupabase: any = {
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

console.log("\n==========================================");
console.log("ALL WHATSAPP OTP TESTS PASSED SUCCESSFULLY");
console.log("==========================================");
