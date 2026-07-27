"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { upsertAutomationSettings } from "@/lib/social/repositories/automation";
import { recordAudit } from "@/lib/social/repositories/system";

export async function setAutonomyLevelAction(formData: FormData) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  const mode = String(formData.get("mode") ?? "MANUAL");
  if (!["MANUAL", "SUPERVISED", "AUTOPILOT"].includes(mode)) return;

  await upsertAutomationSettings(ctx, { autonomy_level: mode });
  await recordAudit({
    actorType: "USER",
    actorId: ctx.ownerId,
    action: "settings.autonomy_level",
    summary: `Set Agent autonomy level to ${mode}`,
    meta: { mode },
  });
  revalidatePath("/admin/social", "layout");
}
