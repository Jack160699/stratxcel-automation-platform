import { getBrandProfile } from "../repositories/brand";
import { type AgentActorContext } from "../agent-tenant-types.ts";

function canonicalLabel(value: unknown, labels: string[], field: string): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  const exact = labels.find((label) => label === value);
  if (exact) return exact;
  const caseInsensitive = labels.find((label) => label.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
  if (caseInsensitive) return caseInsensitive;
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
