/** Pure account presentation helpers for Copilot preview cards (no DB). */

export type AccountPresentationRow = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  platform?: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

function labelFor(platform?: string): string {
  if (!platform) return "";
  return PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
}

/** Presentation identity for cards/modals — never provider IDs, never "Not resolved". */
export function formatAccountPresentation(
  account: AccountPresentationRow | null,
  platform?: string
): {
  accountLabel: string;
  accountHandle?: string;
  accountAvatarUrl?: string;
} {
  const label = labelFor(platform || account?.platform || "");
  if (!account) {
    return { accountLabel: label ? `${label} account` : "Connected account" };
  }
  const display = (account.display_name || "").trim();
  const username = (account.username || "").trim();
  const accountLabel = display || username || (label ? `${label} account` : "Connected account");
  const accountHandle = username || undefined;
  return {
    accountLabel,
    ...(accountHandle ? { accountHandle } : {}),
    ...(account.avatar_url ? { accountAvatarUrl: account.avatar_url } : {}),
  };
}
