import type { AgentRuntimeAdapter } from "./adapter.ts";
import { createDisabledHermesAdapter } from "./disabled-adapter.ts";
import { createMockHermesAdapter } from "./mock-adapter.ts";
import { createHermesHttpAdapter } from "./http-adapter.ts";
import { loadHermesRuntimeConfig } from "./config.ts";

/**
 * Reads HERMES_MODE and returns the matching adapter, defaulting to
 * disabled for anything unset or unrecognized — the same fail-safe
 * pattern as @stratxcel/whatsapp and @stratxcel/payments-and-wallet's
 * integration-mode flags (an env var typo fails toward "nothing runs,"
 * never toward an unintended live call). Config is validated once here
 * (loadHermesRuntimeConfig throws if HERMES_MODE=http but required config
 * is missing) so a misconfiguration surfaces at startup, not mid-mission.
 */
export function selectHermesAdapter(): AgentRuntimeAdapter {
  const config = loadHermesRuntimeConfig();
  if (config.mode === "mock") return createMockHermesAdapter();
  if (config.mode === "http") return createHermesHttpAdapter(config);
  return createDisabledHermesAdapter();
}
