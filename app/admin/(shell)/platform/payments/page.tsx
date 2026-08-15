import { redirect } from "next/navigation";

/** Legacy /admin/platform/payments → Finance admin surface. */
export default function PlatformPaymentsRedirect() {
  redirect("/admin/finance");
}
