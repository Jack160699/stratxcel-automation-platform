// Run with: node --experimental-strip-types packages/byok/src/__tests__/mock-validation.test.ts
import assert from "node:assert/strict";
import { mockValidateProviderKey } from "../mock-validation.ts";

function run() {
  assert.equal(mockValidateProviderKey("openai", "sk-abcdefghijklmnopqrstuvwxyz").valid, true);
  assert.equal(mockValidateProviderKey("openai", "not-a-key").valid, false);
  assert.equal(mockValidateProviderKey("anthropic", "sk-ant-abcdefghijklmnopqrstuvwxyz").valid, true);
  assert.equal(mockValidateProviderKey("anthropic", "sk-abcdefghijklmnopqrstuvwxyz").valid, false); // openai-shaped key rejected for anthropic
  assert.equal(mockValidateProviderKey("google", "AIzaabcdefghijklmnopqrstuvwxyz").valid, true);
  assert.equal(mockValidateProviderKey("elevenlabs", "a".repeat(32)).valid, true);
  assert.equal(mockValidateProviderKey("elevenlabs", "not-hex").valid, false);
  assert.equal(mockValidateProviderKey("unknown-provider", "anything").valid, false);
  assert.equal(mockValidateProviderKey("openai", "").valid, false);

  console.log("mock-validation.test.ts (@stratxcel/byok): ALL PASS");
}

run();
