import { redirect } from "next/navigation";

/** Canonical compatibility route — /use-cases is the real Solutions experience. */
export default function SolutionsRedirect() {
  redirect("/use-cases");
}
