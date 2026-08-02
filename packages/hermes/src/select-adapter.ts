import type { HermesRuntimeAdapter } from "./adapter.ts";
import { createDisabledHermesAdapter } from "./disabled-adapter.ts";
import { createMockHermesAdapter } from "./mock-adapter.ts";
import { createHermesHttpAdapter } from "./http-adapter.ts";

/**
 * Reads HERMES_MODE and returns the matching adapter, defaulting to
 * disabled for anything unset or unrecognized — the same fail-safe
 * pattern as @stratxcel/whatsapp and @stratxcel/payments-and-wallet's
 * integration-mode flags (an env var typo fails toward "nothing runs,"
 * never toward an unintended live call).
 */
export function selectHermesAdapter(): HermesRuntimeAdapter {
  const mode = process.env.HERMES_MODE;
  if (mode === "mock") return createMockHermesAdapter();
  if (mode === "http") return createHermesHttpAdapter();
  return createDisabledHermesAdapter();
}
