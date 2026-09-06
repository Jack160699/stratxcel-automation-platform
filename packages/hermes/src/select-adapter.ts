import type { HermesRuntimeAdapter } from "./adapter.ts";
import { createDisabledHermesAdapter } from "./disabled-adapter.ts";
import { createMockHermesAdapter } from "./mock-adapter.ts";
import { createHermesHttpAdapter } from "./http-adapter.ts";
import { createNativeHermesAdapter, type NativeHermesAdapterDeps } from "./native-adapter.ts";

export interface SelectHermesAdapterOptions {
  /** Required only when HERMES_MODE=native — see native-adapter.ts's own
   *  doc comment for what this needs to contain. Optional otherwise so
   *  every existing disabled/mock/http caller is completely unaffected. */
  native?: NativeHermesAdapterDeps;
}

/**
 * Reads HERMES_MODE and returns the matching adapter, defaulting to
 * disabled for anything unset or unrecognized — the same fail-safe
 * pattern as @stratxcel/whatsapp and @stratxcel/payments-and-wallet's
 * integration-mode flags (an env var typo fails toward "nothing runs,"
 * never toward an unintended live call).
 */
export function selectHermesAdapter(options?: SelectHermesAdapterOptions): HermesRuntimeAdapter {
  const mode = process.env.HERMES_MODE;
  if (mode === "mock") return createMockHermesAdapter();
  if (mode === "http") return createHermesHttpAdapter();
  if (mode === "native") {
    if (!options?.native) {
      throw new Error(
        "HERMES_MODE is 'native' but selectHermesAdapter() was not given NativeHermesAdapterDeps — see apps/mission-worker/src/worker.ts for how the real provider/tool-invoker are constructed"
      );
    }
    return createNativeHermesAdapter(options.native);
  }
  return createDisabledHermesAdapter();
}
