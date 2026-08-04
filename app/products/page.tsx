import { redirect } from "next/navigation";

/** Canonical compatibility route — /modules is the real Products experience. */
export default function ProductsRedirect() {
  redirect("/modules");
}
