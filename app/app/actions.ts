"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * /app's sign-out — same supabase.auth.signOut() call as
 * app/admin/actions.ts's signOutAction, but redirects to the public home
 * page rather than back to a login screen, per
 * docs/product-design/AUTH_AND_ONBOARDING_FLOW.md §5 ("a logged-out visitor
 * belongs on the public site").
 */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
