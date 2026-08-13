import { loadEmailRuntimeConfig } from "../config.ts";
import type { EmailProvider } from "../types.ts";
import { InMemoryEmailProvider } from "./in-memory.ts";
import { ResendEmailProvider } from "./resend.ts";

export function createEmailProvider(options?: {
  forceInMemory?: boolean;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}): EmailProvider {
  const config = loadEmailRuntimeConfig();

  if (options?.forceInMemory || config.testMode || process.env.EMAIL_PROVIDER === "in-memory") {
    return new InMemoryEmailProvider({ configured: true });
  }

  if (config.provider === "resend" || !config.provider) {
    return new ResendEmailProvider({
      apiKey: options?.apiKey,
      fetchImpl: options?.fetchImpl,
    });
  }

  // Unknown provider name → not configured adapter (truthful failure).
  return new ResendEmailProvider({ apiKey: null });
}

export { InMemoryEmailProvider, FakeEmailProvider } from "./in-memory.ts";
export { ResendEmailProvider } from "./resend.ts";
