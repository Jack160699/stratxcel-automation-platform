import { googleBusinessProvider } from "./google-business.ts";
import { instagramProvider } from "./instagram.ts";
import { facebookProvider } from "./facebook.ts";
import { threadsProvider } from "./threads.ts";
import { linkedinProvider } from "./linkedin.ts";
import { youtubeProvider } from "./youtube.ts";
import { xProvider } from "./x.ts";
import type { SocialProvider, SocialProviderName } from "./types.ts";

const registry: Record<string, SocialProvider> = {
  google_business: googleBusinessProvider,
  google: googleBusinessProvider,
  instagram: instagramProvider,
  facebook: facebookProvider,
  threads: threadsProvider,
  linkedin: linkedinProvider,
  youtube: youtubeProvider,
  x: xProvider,
};

/** Active V1 customer-facing OAuth providers. Inactive providers remain in the registry for future V2 extensibility. */
export const V1_CUSTOMER_PROVIDERS: readonly SocialProviderName[] = [
  "google_business",
  "instagram",
  "facebook",
  "youtube",
] as const;

export function isV1CustomerProvider(name: string): boolean {
  return V1_CUSTOMER_PROVIDERS.includes(name as SocialProviderName) || name === "google";
}

export function getProvider(name: string): SocialProvider {
  if (!(name in registry)) {
    throw new Error(`Unknown social provider: ${name}`);
  }
  return registry[name];
}

export function isValidProvider(name: string): name is SocialProviderName {
  return name in registry;
}

export * from "./types.ts";
