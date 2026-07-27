// Focused security test for AES-256-GCM token encryption.
// Run with: node --experimental-strip-types lib/social/__tests__/crypto.test.ts
// Requires SOCIAL_TOKEN_ENCRYPTION_KEY to be set (base64 of 32 random bytes).

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptToken, decryptToken, encryptTokenPacked, decryptTokenPacked, packEncryptedField, unpackEncryptedField } from "../crypto.ts";

function run() {
  const plaintext = "IGAAtest-access-token-1234567890";

  // 1. Round-trip: encrypt -> decrypt -> exact original plaintext
  const enc = encryptToken(plaintext);
  const dec = decryptToken(enc);
  assert.equal(dec, plaintext, "decrypted plaintext must exactly match original");

  // 2. Same plaintext encrypted twice must produce different ciphertext/IV (random IV)
  const enc2 = encryptToken(plaintext);
  assert.notEqual(enc.iv, enc2.iv, "IV must be unique per encryption");
  assert.notEqual(
    enc.ciphertext,
    enc2.ciphertext,
    "ciphertext must differ across encryptions of the same plaintext"
  );
  // but both must still decrypt correctly
  assert.equal(decryptToken(enc2), plaintext);

  // 3. Tampered ciphertext must fail to decrypt (GCM auth tag mismatch)
  const tamperedCiphertext = {
    ...enc,
    ciphertext: Buffer.from(
      Buffer.from(enc.ciphertext, "base64").map((b, i) => (i === 0 ? b ^ 0xff : b))
    ).toString("base64"),
  };
  assert.throws(() => decryptToken(tamperedCiphertext), "tampered ciphertext must throw");

  // 4. Tampered auth tag must fail to decrypt
  const tamperedTag = {
    ...enc,
    tag: Buffer.from(Buffer.from(enc.tag, "base64").map((b, i) => (i === 0 ? b ^ 0xff : b))).toString(
      "base64"
    ),
  };
  assert.throws(() => decryptToken(tamperedTag), "tampered auth tag must throw");

  // 5. Wrong key must fail to decrypt
  const originalKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  const wrongKey = crypto.randomBytes(32).toString("base64");
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = wrongKey;
  assert.throws(() => decryptToken(enc), "decrypting with the wrong key must throw");
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = originalKey;

  // 6. Missing key must throw a clear error, not silently proceed
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  assert.throws(() => encryptToken(plaintext), /SOCIAL_TOKEN_ENCRYPTION_KEY/);
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = originalKey;

  // 7. Packed single-column round trip (social_tokens schema: one text
  // column per token, not three) — pack/unpack must be lossless.
  const packed = encryptTokenPacked(plaintext);
  assert.equal(packed.split(".").length, 3, "packed field must have exactly 3 dot-delimited segments");
  assert.equal(decryptTokenPacked(packed), plaintext, "packed round-trip must recover original plaintext");
  const unpacked = unpackEncryptedField(packed);
  assert.equal(packEncryptedField(unpacked), packed, "pack(unpack(x)) must equal x");
  assert.throws(() => unpackEncryptedField("not-enough-segments"), "malformed packed field must throw");

  console.log("crypto.test.ts: ALL PASS (roundtrip, IV uniqueness, tamper rejection x2, wrong-key rejection, missing-key guard, pack/unpack roundtrip)");
}

run();
