"use server";

import { redirect } from "next/navigation";
import { clearStaffWorkspaceCookie } from "@/lib/identity/staff-workspace";

export async function returnToAdminAction(): Promise<never> {
  await clearStaffWorkspaceCookie();
  redirect("/admin");
}
