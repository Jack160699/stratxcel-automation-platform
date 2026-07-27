"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { getBrandProfile, upsertBrandProfile, type BrandProfileRow } from "@/lib/social/repositories/brand";
import { recordAudit } from "@/lib/social/repositories/system";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function saveBrandProfileAction(formData: FormData) {
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

export async function addProductAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
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
}

export async function removeProductAction(formData: FormData) {
  const index = Number(formData.get("index") ?? -1);
  await patchArrayField("products", (arr) => arr.filter((_, i) => i !== index));
}

export async function addAudienceAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await patchArrayField("audiences", (arr) => [...arr, { name, pain_points: String(formData.get("pain_points") ?? "") || undefined }]);
}

export async function removeAudienceAction(formData: FormData) {
  const index = Number(formData.get("index") ?? -1);
  await patchArrayField("audiences", (arr) => arr.filter((_, i) => i !== index));
}

export async function addPillarAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await patchArrayField("content_pillars", (arr) => [...arr, { name, description: String(formData.get("description") ?? "") || undefined }]);
}

export async function removePillarAction(formData: FormData) {
  const index = Number(formData.get("index") ?? -1);
  await patchArrayField("content_pillars", (arr) => arr.filter((_, i) => i !== index));
}

export async function addBrandRuleAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await patchArrayField("rules", (arr) => [...arr, { kind: String(formData.get("kind") ?? "forbidden_claim"), text }]);
}

export async function removeBrandRuleAction(formData: FormData) {
  const index = Number(formData.get("index") ?? -1);
  await patchArrayField("rules", (arr) => arr.filter((_, i) => i !== index));
}

export async function addKnowledgeSourceAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await patchArrayField("source_material", (arr) => [
    ...arr,
    {
      kind: String(formData.get("kind") ?? "note"),
      title,
      content: String(formData.get("content") ?? "") || undefined,
      source_url: String(formData.get("source_url") ?? "") || undefined,
    },
  ]);
}

export async function removeKnowledgeSourceAction(formData: FormData) {
  const index = Number(formData.get("index") ?? -1);
  await patchArrayField("source_material", (arr) => arr.filter((_, i) => i !== index));
}
