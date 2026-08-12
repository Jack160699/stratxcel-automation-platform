"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { getBrandProfile, upsertBrandProfile, replaceAtIndex, type BrandProfileRow } from "@/lib/social/repositories/brand";
import { recordAudit } from "@/lib/social/repositories/system";
import type { BrandActionResult } from "./types";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

const GENERIC_ERROR = "Could not save. Please try again.";

export async function saveBrandProfileAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  try {
    const ctx = await assertOwner();
    await upsertBrandProfile(ctx, {
      identity: {
        name: String(formData.get("company_name") ?? "") || undefined,
        industry: String(formData.get("industry") ?? "") || undefined,
        business_model: String(formData.get("business_model") ?? "") || undefined,
        positioning: String(formData.get("positioning") ?? "") || undefined,
        description: String(formData.get("description") ?? "") || undefined,
      },
      voice: {
        tone: String(formData.get("voice_tone") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        blocked_phrases: String(formData.get("voice_avoid") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        forbidden_claims: (await getBrandProfile(ctx)).voice.forbidden_claims,
      },
    });
    await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "brand.profile.save", summary: "Updated Brand Brain company profile" });
    revalidatePath("/admin/social/brand");
    return { ok: true, message: "Company profile saved" };
  } catch (err) {
    console.error("saveBrandProfileAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

async function patchArrayField<K extends "products" | "content_pillars" | "rules" | "audiences" | "source_material">(
  field: K,
  mutate: (arr: BrandProfileRow[K]) => BrandProfileRow[K]
) {
  const ctx = await assertOwner();
  const current = await getBrandProfile(ctx);
  await upsertBrandProfile(ctx, { [field]: mutate(current[field]) } as Partial<BrandProfileRow>);
  revalidatePath("/admin/social/brand");
}

// ————— Products —————

export async function addProductAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  try {
    await patchArrayField("products", (arr) => [
      ...arr,
      {
        name,
        description: String(formData.get("description") ?? "") || undefined,
        audience: String(formData.get("audience") ?? "") || undefined,
        cta: String(formData.get("cta") ?? "") || undefined,
        url: String(formData.get("url") ?? "") || undefined,
      },
    ]);
    return { ok: true, message: "Product added" };
  } catch (err) {
    console.error("addProductAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateProductAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  try {
    await patchArrayField("products", (arr) =>
      replaceAtIndex(arr, index, {
        name,
        description: String(formData.get("description") ?? "") || undefined,
        audience: String(formData.get("audience") ?? "") || undefined,
        cta: String(formData.get("cta") ?? "") || undefined,
        url: String(formData.get("url") ?? "") || undefined,
      })
    );
    return { ok: true, message: "Product updated" };
  } catch (err) {
    console.error("updateProductAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removeProductAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  try {
    await patchArrayField("products", (arr) => arr.filter((_, i) => i !== index));
    return { ok: true, message: "Product removed" };
  } catch (err) {
    console.error("removeProductAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ————— Audiences —————

export async function addAudienceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Segment name is required." };
  try {
    await patchArrayField("audiences", (arr) => [...arr, { name, pain_points: String(formData.get("pain_points") ?? "") || undefined }]);
    return { ok: true, message: "Audience added" };
  } catch (err) {
    console.error("addAudienceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateAudienceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Segment name is required." };
  try {
    await patchArrayField("audiences", (arr) =>
      replaceAtIndex(arr, index, { name, pain_points: String(formData.get("pain_points") ?? "") || undefined })
    );
    return { ok: true, message: "Audience updated" };
  } catch (err) {
    console.error("updateAudienceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removeAudienceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  try {
    await patchArrayField("audiences", (arr) => arr.filter((_, i) => i !== index));
    return { ok: true, message: "Audience removed" };
  } catch (err) {
    console.error("removeAudienceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ————— Content pillars —————

export async function addPillarAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Pillar name is required." };
  try {
    await patchArrayField("content_pillars", (arr) => [...arr, { name, description: String(formData.get("description") ?? "") || undefined }]);
    return { ok: true, message: "Pillar added" };
  } catch (err) {
    console.error("addPillarAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updatePillarAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Pillar name is required." };
  try {
    await patchArrayField("content_pillars", (arr) =>
      replaceAtIndex(arr, index, { name, description: String(formData.get("description") ?? "") || undefined })
    );
    return { ok: true, message: "Pillar updated" };
  } catch (err) {
    console.error("updatePillarAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removePillarAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  try {
    await patchArrayField("content_pillars", (arr) => arr.filter((_, i) => i !== index));
    return { ok: true, message: "Pillar removed" };
  } catch (err) {
    console.error("removePillarAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ————— Rules —————

export async function addBrandRuleAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Rule text is required." };
  try {
    await patchArrayField("rules", (arr) => [...arr, { kind: String(formData.get("kind") ?? "forbidden_claim"), text }]);
    return { ok: true, message: "Rule saved" };
  } catch (err) {
    console.error("addBrandRuleAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateBrandRuleAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Rule text is required." };
  try {
    await patchArrayField("rules", (arr) => replaceAtIndex(arr, index, { kind: String(formData.get("kind") ?? "forbidden_claim"), text }));
    return { ok: true, message: "Rule updated" };
  } catch (err) {
    console.error("updateBrandRuleAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removeBrandRuleAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  try {
    await patchArrayField("rules", (arr) => arr.filter((_, i) => i !== index));
    return { ok: true, message: "Rule removed" };
  } catch (err) {
    console.error("removeBrandRuleAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ————— Knowledge sources —————

export async function addKnowledgeSourceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  try {
    await patchArrayField("source_material", (arr) => [
      ...arr,
      {
        kind: String(formData.get("kind") ?? "note"),
        title,
        content: String(formData.get("content") ?? "") || undefined,
        source_url: String(formData.get("source_url") ?? "") || undefined,
      },
    ]);
    return { ok: true, message: "Source added" };
  } catch (err) {
    console.error("addKnowledgeSourceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateKnowledgeSourceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  try {
    await patchArrayField("source_material", (arr) =>
      replaceAtIndex(arr, index, {
        kind: String(formData.get("kind") ?? "note"),
        title,
        content: String(formData.get("content") ?? "") || undefined,
        source_url: String(formData.get("source_url") ?? "") || undefined,
      })
    );
    return { ok: true, message: "Source updated" };
  } catch (err) {
    console.error("updateKnowledgeSourceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function removeKnowledgeSourceAction(_prevState: BrandActionResult | null, formData: FormData): Promise<BrandActionResult> {
  const index = Number(formData.get("index") ?? -1);
  try {
    await patchArrayField("source_material", (arr) => arr.filter((_, i) => i !== index));
    return { ok: true, message: "Source removed" };
  } catch (err) {
    console.error("removeKnowledgeSourceAction failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
