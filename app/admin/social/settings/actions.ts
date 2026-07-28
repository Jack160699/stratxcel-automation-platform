"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { upsertAutomationSettings } from "@/lib/social/repositories/automation";
import { recordAudit } from "@/lib/social/repositories/system";

export async function setAutonomyLevelAction(formData: FormData) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  const mode = String(formData.get("mode") ?? "MANUAL");
  if (!["MANUAL", "SUPERVISED", "AUTOPILOT"].includes(mode)) {
    redirect("/admin/social/settings?status=error&message=Invalid+autonomy+level");
  }

  try {
    await upsertAutomationSettings(ctx, { autonomy_level: mode as "MANUAL" | "SUPERVISED" | "AUTOPILOT" });
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action: "settings.autonomy_level",
      summary: `Set Agent autonomy level to ${mode}`,
      meta: { mode },
    });
    revalidatePath("/admin/social", "layout");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save autonomy level";
    redirect(`/admin/social/settings?status=error&message=${encodeURIComponent(message)}`);
  }
  redirect("/admin/social/settings?status=saved&message=Autonomy+level+saved");
}
