import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/Feedback";

/** Consistent "no {resource} yet" copy for module list sections — thin wrapper over components/ui/Feedback.tsx's EmptyState so every module uses the same phrasing pattern instead of ad hoc titles. */
export function EmptyModuleState({ resource, subtitle, action }: { resource: string; subtitle?: string; action?: ReactNode }) {
  return <EmptyState title={`No ${resource} yet.`} subtitle={subtitle} action={action} />;
}
