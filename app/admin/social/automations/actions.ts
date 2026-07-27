"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { createAutomation, setAutomationEnabled, deleteAutomation } from "@/lib/social/automations";
import { upsertAutomationSettings } from "@/lib/social/repositories/automation";
import { recordAudit } from "@/lib/social/repositories/system";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function createAutomationAction(formData: FormData) {
  const ctx = await assertOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const triggerType = String(formData.get("trigger") ?? "post_published") as "post_published" | "job_dead_letter";
  const actionTypes = formData.getAll("actions").map(String) as Array<"notify" | "propose_followup">;

  await createAutomation(ctx, {
    name,
    description: String(formData.get("description") ?? "") || null,
    trigger: { type: triggerType },
    actions: actionTypes.length ? actionTypes.map((type) => ({ type })) : [{ type: "notify" }],
  });
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "automation.create", summary: `Created automation "${name}"` });
  revalidatePath("/admin/social/automations");
}

export async function toggleAutomationAction(formData: FormData) {
  const ctx = await assertOwner();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  if (!id) return;
  await setAutomationEnabled(ctx, id, enabled);
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "automation.toggle", targetId: id, summary: `${enabled ? "Enabled" : "Disabled"} an automation` });
  revalidatePath("/admin/social/automations");
}

export async function deleteAutomationAction(formData: FormData) {
  const ctx = await assertOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteAutomation(ctx, id);
  revalidatePath("/admin/social/automations");
}

export async function saveGuardrailsAction(formData: FormData) {
  const ctx = await assertOwner();
  await upsertAutomationSettings(ctx, {
    qa_threshold: Number(formData.get("qa_threshold") ?? 85) || 85,
    monthly_budget_cents: Math.round(Number(formData.get("monthly_budget_dollars") ?? 0) * 100) || 0,
    per_content_max_cents: Math.round(Number(formData.get("per_content_max_dollars") ?? 0) * 100) || 0,
    require_approval_for: String(formData.get("requireApprovalFor") ?? "publish_post")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    min_confidence_to_autoact: Number(formData.get("minConfidenceToAutoAct") ?? 0.7) || 0.7,
  });
  await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "guardrails.save", summary: "Updated automation guardrails" });
  revalidatePath("/admin/social/automations");
}
