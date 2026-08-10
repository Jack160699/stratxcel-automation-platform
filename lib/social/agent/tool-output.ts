/**
 * Serializes a tool's output for the model's context. The previous approach
 * (`JSON.stringify(output).slice(0, N)`) cut the JSON string at an
 * arbitrary character boundary — for any tool returning multiple lists
 * (Brand Brain being the clearest case: products/pillars/rules routinely
 * sit past a 4,000-character cutoff), this silently dropped entire fields
 * mid-object, and the model had no way to know data was missing versus
 * genuinely absent.
 *
 * This never cuts mid-object. If the full JSON already fits within the
 * budget, it's returned unchanged — the overwhelming majority of tool
 * outputs (health checks, account lists, campaign lists) are small enough
 * that this is a no-op. Only when a result is genuinely too large does it
 * truncate — always by dropping whole array items from the end, and always
 * attaching explicit `truncated` metadata (returned/total counts) so the
 * model can see that more exists rather than assuming it's empty.
 */

const DEFAULT_MAX_CHARS = 8000;

export function projectToolOutputForModel(toolName: string | undefined, output: unknown): unknown {
  if (toolName === "inspect_accounts") {
    const accounts = Array.isArray(output) ? output : [];
    return {
      connected_platforms: [...new Set(accounts
        .filter((account) => isRecord(account) && account.status === "CONNECTED")
        .map((account) => String((account as Record<string, unknown>).platform ?? "").toLowerCase())
        .filter(Boolean))],
      note: "Account selection and trusted identifiers are resolved locally during publishing.",
    };
  }
  if (toolName === "get_performance") {
    return { local_only: true, note: "Raw performance data is not available to the external model." };
  }
  if (toolName === "inspect_health") {
    return { local_only: true, note: "Account, provider, and worker health details remain local." };
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function serializeToolOutput(output: unknown, maxChars: number = DEFAULT_MAX_CHARS, toolName?: string): string {
  const modelSafeOutput = projectToolOutputForModel(toolName, output);
  const full = JSON.stringify(modelSafeOutput);
  if (full === undefined) return "null";
  if (full.length <= maxChars) return full;

  if (Array.isArray(modelSafeOutput)) {
    return JSON.stringify(truncateArrayOutput(modelSafeOutput, maxChars));
  }

  if (modelSafeOutput && typeof modelSafeOutput === "object") {
    return JSON.stringify(truncateObjectOutput(modelSafeOutput as Record<string, unknown>, maxChars));
  }

  // A single oversized primitive/string (rare) — still never silently cut without saying so.
  return JSON.stringify({ truncated: true, note: "Output too large to include in full.", preview: full.slice(0, maxChars) });
}

function takeItemsWithinBudget(items: unknown[], budget: number): unknown[] {
  const kept: unknown[] = [];
  let size = 2; // "[" + "]"
  for (const item of items) {
    const addedSize = JSON.stringify(item).length + 1; // +1 for the separating comma
    if (kept.length > 0 && size + addedSize > budget) break;
    kept.push(item);
    size += addedSize;
  }
  return kept;
}

function truncateArrayOutput(items: unknown[], maxChars: number): unknown {
  // Reserve headroom for the metadata wrapper itself.
  const kept = takeItemsWithinBudget(items, maxChars - 160);
  if (kept.length >= items.length) return items;
  return {
    items: kept,
    truncated: true,
    returned_items: kept.length,
    total_items: items.length,
  };
}

function truncateObjectOutput(obj: Record<string, unknown>, maxChars: number): Record<string, unknown> {
  const result = { ...obj };
  const arrayKeys = Object.keys(result)
    .filter((k) => Array.isArray(result[k]))
    .sort((a, b) => (result[b] as unknown[]).length - (result[a] as unknown[]).length);

  for (const key of arrayKeys) {
    if (JSON.stringify(result).length <= maxChars) break;
    const items = result[key] as unknown[];
    if (items.length === 0) continue;

    // Budget this field against how much room is left once every OTHER
    // field is accounted for, so we don't starve one array to protect
    // another that's already comfortably within range.
    const withoutThisField = JSON.stringify({ ...result, [key]: [] }).length;
    const budgetForField = Math.max(160, maxChars - withoutThisField);
    const kept = takeItemsWithinBudget(items, budgetForField);
    if (kept.length < items.length) {
      result[key] = kept;
      result[`${key}_truncated`] = {
        truncated: true,
        returned_items: kept.length,
        total_items: items.length,
      };
    }
  }

  return result;
}
