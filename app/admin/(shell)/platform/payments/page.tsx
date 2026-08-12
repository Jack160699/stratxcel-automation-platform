import { redirect } from "next/navigation";

/** Legacy /admin/platform/payments → Go Free Codes admin surface. */
export default function PlatformPaymentsRedirect() {
  redirect("/admin/go-free-codes");
}
