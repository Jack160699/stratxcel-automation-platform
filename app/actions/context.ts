"use server";

import { redirect } from "next/navigation";
import {
  switchAccountContext,
  getAvailableAccountContexts,
  type AccountContext,
} from "@/lib/identity/account-context.ts";

export async function switchContextAction(target: AccountContext): Promise<void> {
  const result = await switchAccountContext(target);
  redirect(result.redirect);
}

export async function selectContextAction(target: AccountContext): Promise<void> {
  const result = await switchAccountContext(target);
  redirect(result.redirect);
}

export async function getContextsAction() {
  return await getAvailableAccountContexts();
}
