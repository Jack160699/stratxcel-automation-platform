"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin");
}

const STATUSES = ["new", "read", "replied", "archived"] as const;
type MessageStatus = (typeof STATUSES)[number];

export async function setMessageStatusAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as MessageStatus;
  if (!id || !STATUSES.includes(status)) return;

  // RLS restricts this update to signed-in Stratxcel admins.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("stratxcel_contact_messages")
    .update({ status })
    .eq("id", id);

  if (error) console.error("status update failed:", error.message);
  revalidatePath("/admin");
}
