export type ChatProviderKey = "chatgpt" | "claude" | "gemini" | "whatsapp_business" | "slack" | "telegram" | "other_import";
export type ChatAuthMode = "IMPORT" | "OAUTH" | "BOT_TOKEN" | "EXISTING_BRIDGE" | "PROJECT_API";

export interface ChatProvider {
  key: ChatProviderKey;
  displayName: string;
  capability: string;
  authMode: ChatAuthMode;
  supportsLiveSync: boolean;
  supportsImport: boolean;
  scopes: readonly string[];
}

export const CHAT_PROVIDERS: readonly ChatProvider[] = [
  { key: "chatgpt", displayName: "ChatGPT", capability: "Official personal export import; OpenAI API project conversations are separate", authMode: "IMPORT", supportsLiveSync: false, supportsImport: true, scopes: [] },
  { key: "claude", displayName: "Claude", capability: "Official personal export import; live sync requires Enterprise Compliance API", authMode: "IMPORT", supportsLiveSync: false, supportsImport: true, scopes: [] },
  { key: "gemini", displayName: "Gemini", capability: "Stratxcel-owned API interactions only; personal Gemini history requires import", authMode: "PROJECT_API", supportsLiveSync: false, supportsImport: true, scopes: [] },
  { key: "whatsapp_business", displayName: "WhatsApp Business", capability: "Business Cloud API signals through existing Stratxcel infrastructure; no personal WhatsApp", authMode: "EXISTING_BRIDGE", supportsLiveSync: true, supportsImport: false, scopes: ["business signals only"] },
  { key: "slack", displayName: "Slack", capability: "Selected workspace channels only, read-only", authMode: "OAUTH", supportsLiveSync: true, supportsImport: false, scopes: ["channels:read", "channels:history", "users:read"] },
  { key: "telegram", displayName: "Telegram", capability: "Bot conversations only", authMode: "BOT_TOKEN", supportsLiveSync: true, supportsImport: false, scopes: ["bot updates"] },
  { key: "other_import", displayName: "Other / import", capability: "Bounded normalized JSON import", authMode: "IMPORT", supportsLiveSync: false, supportsImport: true, scopes: [] },
] as const;

export function getChatProvider(key: string): ChatProvider | undefined {
  return CHAT_PROVIDERS.find((provider) => provider.key === key);
}
