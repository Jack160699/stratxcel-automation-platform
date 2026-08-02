// Run with: node --experimental-strip-types packages/byok/src/__tests__/registry.test.ts
import assert from "node:assert/strict";
import { PROVIDER_REGISTRY, getProviderDefinition, listProvidersForCapability } from "../registry.ts";

function run() {
  assert.ok(PROVIDER_REGISTRY.length > 0);
  assert.ok(getProviderDefinition("openai"));
  assert.equal(getProviderDefinition("nonexistent-provider"), undefined);

  const visionProviders = listProvidersForCapability("vision");
  assert.ok(visionProviders.length > 0);
  assert.ok(visionProviders.every((p) => p.capabilities.vision === true));

  const speechProviders = listProvidersForCapability("speech");
  assert.ok(speechProviders.some((p) => p.key === "elevenlabs"));

  console.log("registry.test.ts (@stratxcel/byok): ALL PASS");
}

run();
