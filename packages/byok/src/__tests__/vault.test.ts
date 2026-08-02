// Run with: node --experimental-strip-types packages/byok/src/__tests__/vault.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret, parseEncryptionKey } from "../vault.ts";

function run() {
  const key = parseEncryptionKey(crypto.randomBytes(32).toString("hex"));
  const secret = "sk-super-secret-api-key-value";

  const encrypted = encryptSecret(secret, key);
  assert.notEqual(encrypted.ciphertext, secret);
  assert.ok(!encrypted.ciphertext.includes("super-secret"));

  const decrypted = decryptSecret(encrypted, key);
  assert.equal(decrypted, secret);

  // Tampered ciphertext must fail authentication (GCM auth tag), not
  // silently decrypt to garbage.
  const tampered = { ...encrypted, ciphertext: Buffer.from("tampered-data-that-is-not-real").toString("base64") };
  assert.throws(() => decryptSecret(tampered, key));

  // Wrong key must fail to decrypt
  const wrongKey = parseEncryptionKey(crypto.randomBytes(32).toString("hex"));
  assert.throws(() => decryptSecret(encrypted, wrongKey));

  // Key must be exactly 32 bytes
  assert.throws(() => parseEncryptionKey("tooshort"));

  console.log("vault.test.ts (@stratxcel/byok): ALL PASS");
}

run();
