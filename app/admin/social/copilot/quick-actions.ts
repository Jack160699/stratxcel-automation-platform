// Contextual quick-action prompts per workspace page. These are real Agent
// prompts routed through the normal send flow — clicking one never mutates
// data directly; the existing approval policy still gates any tool call the
// Agent decides to make in response.

export function quickActionsForPath(pathname: string): string[] {
  if (pathname.startsWith("/admin/social/brand")) {
    return ["Summarize Brand Brain", "Find missing context"];
  }
  if (pathname.startsWith("/admin/social/create")) {
    return ["Draft a LinkedIn post", "Create variants"];
  }
  if (pathname.startsWith("/admin/social/planner")) {
    return ["Plan next week", "Check scheduled posts"];
  }
  if (pathname.startsWith("/admin/social/analytics")) {
    return ["Analyze recent performance"];
  }
  if (pathname === "/admin/social") {
    return ["Check system health", "Plan this week"];
  }
  return ["Check system health", "Plan this week"];
}

export function contextChipForPath(pathname: string): string | null {
  if (pathname.startsWith("/admin/social/brand")) return "Brand Brain";
  if (pathname.startsWith("/admin/social/create")) return "Create";
  if (pathname.startsWith("/admin/social/planner")) return "Planner";
  if (pathname.startsWith("/admin/social/analytics")) return "Analytics";
  if (pathname === "/admin/social") return "Command Center";
  return null;
}
