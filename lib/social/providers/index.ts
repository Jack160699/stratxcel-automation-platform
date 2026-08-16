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
