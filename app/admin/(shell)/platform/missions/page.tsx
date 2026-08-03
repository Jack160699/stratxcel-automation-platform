import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/missions (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyMissionsRedirect() {
  redirect("/admin/missions");
}
