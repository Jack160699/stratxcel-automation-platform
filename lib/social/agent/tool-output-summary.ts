// Derives safe, real metadata (counts only, never content) from a tool's
// actual output — used to annotate TOOL_COMPLETED execution events, e.g.
// "Brand Brain loaded — 18 products, 9 audiences" instead of a bare
// "Completed". Never fabricates a count that isn't actually present in the
// output the tool really returned.

export function summarizeForEvent(output: unknown): Record<string, number> | undefined {
  if (Array.isArray(output)) {
    return { count: output.length };
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (obj.counts && typeof obj.counts === "object" && !Array.isArray(obj.counts)) {
      const counts = obj.counts as Record<string, unknown>;
      const safe: Record<string, number> = {};
      for (const [k, v] of Object.entries(counts)) {
        if (typeof v === "number") safe[k] = v;
      }
      if (Object.keys(safe).length) return safe;
    }
    const arrayFieldCounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) arrayFieldCounts[key] = value.length;
    }
    if (Object.keys(arrayFieldCounts).length) return arrayFieldCounts;
  }
  return undefined;
}
