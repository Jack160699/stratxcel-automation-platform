import type { ReactNode } from "react";
import { redirect } from "next/navigation";

/** Prevents unfinished engineering surfaces from rendering in the V1 app. */
export function NotV1CustomerRoute({ children: _children }: { children: ReactNode }): never {
  redirect("/app");
}
