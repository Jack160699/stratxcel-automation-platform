import { getBrandProfile } from "../repositories/brand.ts";
import { type AgentActorContext } from "../agent-tenant-types.ts";

function canonicalLabel(value: unknown, labels: string[], field: string): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  const exact = labels.find((label) => label === value);
  if (exact) return exact;
  const caseInsensitive = labels.find((label) => label.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
  if (caseInsensitive) return caseInsensitive;
  // Real bug found live (Local AI certification, 2026-09-05): when `labels`
  // is empty (no saved Brand Brain value of this kind exists yet — the
  // normal state for any tenant that has only completed the basic
  // onboarding wizard, which never writes content_pillars), this used to
  // throw unconditionally with "Available: " (an empty list) — meaning
  // create_content_item/create_content_variant/create_campaign could NEVER
  // succeed for that tenant no matter what the model passed, since nothing
  // can ever match against nothing. Reproduced live: the agent retried
  // create_content_item 3 times with different guesses, failed identically
  // every time, then exhausted MAX_TOOL_ROUNDS with "empty turn output".
  // There is nothing saved to canonicalize against in this case, so pass
  // the model's own value through unchanged rather than permanently
  // blocking every tenant who hasn't set up a content taxonomy yet — a
  // tenant WITH saved values still gets full exact/case-insensitive
  // enforcement, unchanged, above.
  if (labels.length === 0) return value;
  throw new Error(`${field} must match a saved Brand Brain value. Available: ${labels.join(", ")}`);
}

export async function validateBrandEntities(
  ctx: AgentActorContext,
  toolName: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!["create_content_item", "create_content_variant", "create_campaign"].includes(toolName)) return input;
  const profile = await getBrandProfile(ctx);
  return {
    ...input,
    ...(Object.hasOwn(input, "contentPillar")
      ? { contentPillar: canonicalLabel(input.contentPillar, profile.content_pillars.map((p) => p.name), "Content pillar") }
      : {}),
    ...(Object.hasOwn(input, "audience")
      ? { audience: canonicalLabel(input.audience, profile.audiences.map((a) => a.name), "Audience") }
      : {}),
    ...(Object.hasOwn(input, "product")
      ? { product: canonicalLabel(input.product, profile.products.map((p) => p.name), "Product") }
      : {}),
  };
}
