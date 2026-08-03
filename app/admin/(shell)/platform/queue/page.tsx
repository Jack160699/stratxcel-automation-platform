import { redirect } from "next/navigation";

/** Compatibility wrapper — renamed to /admin/operations (ADMIN_INFORMATION_ARCHITECTURE.md §1). */
export default function LegacyQueueRedirect() {
  redirect("/admin/operations");
}
