import { redirect } from "next/navigation";

/** Compatibility route — /products is the canonical product discovery experience. */
export default function ModulesRedirect() {
  redirect("/products");
}
