import { redirect } from "next/navigation";

/** Compatibility wrapper — its content (integration status) is now /admin/system (System Health). */
export default function LegacyPlatformRedirect() {
  redirect("/admin/system");
}
