import { instagramProvider } from "./instagram";
import { facebookProvider } from "./facebook";
import { threadsProvider } from "./threads";
import { linkedinProvider } from "./linkedin";
import { youtubeProvider } from "./youtube";
import type { SocialProvider, SocialProviderName } from "./types";

const registry: Record<SocialProviderName, SocialProvider> = {
  instagram: instagramProvider,
  facebook: facebookProvider,
  threads: threadsProvider,
  linkedin: linkedinProvider,
  youtube: youtubeProvider,
};

export function getProvider(name: string): SocialProvider {
  if (!(name in registry)) {
    throw new Error(`Unknown social provider: ${name}`);
  }
  return registry[name as SocialProviderName];
}

export function isValidProvider(name: string): name is SocialProviderName {
  return name in registry;
}

export * from "./types";
