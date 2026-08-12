"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  const parseOptionalDollars = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return null;
    const dollars = Number(raw);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) throw new Error("Budgets must be between $0 and $1,000,000.");
    return Math.round(dollars * 100);
  };
  try {
    const qaThreshold = Number(formData.get("qa_threshold"));
    const confidencePercent = Number(formData.get("minConfidenceToAutoAct"));
    if (!Number.isFinite(qaThreshold) || qaThreshold < 0 || qaThreshold > 100) throw new Error("QA threshold must be from 0 to 100.");
    if (!Number.isFinite(confidencePercent) || confidencePercent < 0 || confidencePercent > 100) throw new Error("Confidence must be from 0% to 100%.");
    await upsertAutomationSettings(ctx, {
      qa_threshold: qaThreshold,
      monthly_budget_cents: parseOptionalDollars("monthly_budget_dollars"),
      per_content_max_cents: parseOptionalDollars("per_content_max_dollars"),
      require_approval_for: formData.getAll("requireApprovalFor").map(String),
      min_confidence_to_autoact: confidencePercent / 100,
    });
    await recordAudit({ actorType: "USER", actorId: ctx.ownerId, action: "guardrails.save", summary: "Updated automation guardrails" });
    revalidatePath("/admin/social/automations");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save guardrails";
    redirect(`/admin/social/automations?status=error&message=${encodeURIComponent(message)}`);
  }
  redirect("/admin/social/automations?status=saved&message=Guardrails+saved");
}
