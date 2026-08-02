const FORMAT_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  google: /^AIza[A-Za-z0-9_-]{20,}$/,
  elevenlabs: /^[a-f0-9]{32}$/,
  stability: /^sk-[A-Za-z0-9]{20,}$/,
};

export interface MockValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Format-only validation — never calls the real provider API. This is
 * deliberately how far BYOK validation goes without real credentials
 * tonight: enough to catch an obviously wrong paste (wrong provider's key
 * format, truncated key) without making a network call to a provider that
 * would actually charge for or rate-limit the attempt. Real validation
 * (an actual authenticated test call to each provider) is a follow-up once
 * test credentials exist for at least one provider.
 */
export function mockValidateProviderKey(providerKey: string, candidateSecret: string): MockValidationResult {
  const pattern = FORMAT_PATTERNS[providerKey];
  if (!pattern) return { valid: false, reason: `Unknown provider '${providerKey}'` };
  if (!candidateSecret || candidateSecret.trim().length === 0) return { valid: false, reason: "Empty key" };
  if (!pattern.test(candidateSecret)) return { valid: false, reason: `Key does not match expected format for '${providerKey}'` };
  return { valid: true };
}
