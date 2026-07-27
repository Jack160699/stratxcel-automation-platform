"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/social/admin-guard";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runWorkerBatch } from "@/lib/social/worker";

async function assertAdmin() {
  const admin = await requireAdmin();
  if (!admin.ok) throw new Error(admin.error);
  return admin;
}

export async function disconnectAccountAction(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const service = createSupabaseServiceClient();
  // Wipe token material on disconnect — don't just flip a status flag while
  // leaving encrypted tokens sitting around unused.
  await service
    .from("social_accounts")
    .update({
      status: "disconnected",
      access_token_ciphertext: null,
      access_token_iv: null,
      access_token_tag: null,
      refresh_token_ciphertext: null,
      refresh_token_iv: null,
      refresh_token_tag: null,
    })
    .eq("id", id);

  await service.from("social_system_events").insert({
    category: "oauth",
    level: "info",
    message: "Account disconnected",
    meta: { account_id: id },
  });

  revalidatePath("/admin/social");
}

export async function setPublishingModeAction(formData: FormData) {
  await assertAdmin();
  const mode = String(formData.get("mode") ?? "shadow");
  if (mode !== "shadow" && mode !== "live") return;

  const service = createSupabaseServiceClient();
  await service
    .from("social_settings")
    .upsert({ key: "publishing_mode", value: JSON.stringify(mode), updated_at: new Date().toISOString() });

  await service.from("social_system_events").insert({
    category: "worker",
    level: mode === "live" ? "warn" : "info",
    message: `Publishing mode set to ${mode}`,
  });

  revalidatePath("/admin/social");
}

export async function createCampaignAction(formData: FormData) {
  const admin = await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const platforms = formData.getAll("platforms").map(String);
  const cadence = String(formData.get("cadence") ?? "") || null;

  const service = createSupabaseServiceClient();
  await service.from("social_campaigns").insert({
    name,
    description: String(formData.get("description") ?? "") || null,
    platforms,
    cadence,
    created_by: admin.userId,
  });

  revalidatePath("/admin/social");
}

export async function createContentItemAction(formData: FormData) {
  const admin = await assertAdmin();
  const baseCaption = String(formData.get("base_caption") ?? "").trim();
  if (!baseCaption) return;

  const campaignId = String(formData.get("campaign_id") ?? "") || null;
  const hashtags = String(formData.get("hashtags") ?? "")
    .split(/[,\s]+/)
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
  const mediaUrls = String(formData.get("media_urls") ?? "")
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const service = createSupabaseServiceClient();
  await service.from("social_content_items").insert({
    campaign_id: campaignId,
    title: String(formData.get("title") ?? "") || null,
    base_caption: baseCaption,
    hashtags,
    cta: String(formData.get("cta") ?? "") || null,
    media_urls: mediaUrls,
    status: "approved",
    created_by: admin.userId,
  });

  revalidatePath("/admin/social");
}

export async function schedulePostAction(formData: FormData) {
  const admin = await assertAdmin();
  const contentItemId = String(formData.get("content_item_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  if (!contentItemId || !accountId || !provider || !scheduledFor) return;

  const service = createSupabaseServiceClient();
  const { data: scheduled, error } = await service
    .from("social_scheduled_posts")
    .insert({
      content_item_id: contentItemId,
      account_id: accountId,
      provider,
      scheduled_for: new Date(scheduledFor).toISOString(),
      created_by: admin.userId,
    })
    .select("id")
    .single();

  if (error || !scheduled) {
    console.error("schedule insert failed:", error?.message);
    return;
  }

  // Always create the job in shadow mode by default; the worker reads the
  // global publishing_mode setting at claim time as the source of truth.
  await service.from("social_jobs").insert({
    scheduled_post_id: scheduled.id,
    run_after: new Date(scheduledFor).toISOString(),
    mode: "shadow",
  });

  revalidatePath("/admin/social");
}

export async function runWorkerNowAction() {
  // Admin-gated server action that runs the SAME batch-claim logic as the
  // cron-triggered route, in-process. No HTTP round trip, no CRON_SECRET,
  // no NEXT_PUBLIC_SITE_URL involved — nothing here can leak a secret to
  // the browser because the browser only ever receives a reference to this
  // server action, never its closure or the values it reads.
  await assertAdmin();
  try {
    await runWorkerBatch();
  } catch (err) {
    console.error("manual worker trigger failed:", err);
  }
  revalidatePath("/admin/social");
}

export async function cancelScheduledPostAction(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const service = createSupabaseServiceClient();
  await service.from("social_scheduled_posts").update({ status: "cancelled" }).eq("id", id);
  await service
    .from("social_jobs")
    .update({ status: "dead_letter", last_error: "cancelled by admin" })
    .eq("scheduled_post_id", id)
    .in("status", ["pending", "claimed"]);

  revalidatePath("/admin/social");
}
