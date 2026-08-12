import type { ReactNode } from "react";
import { DEMO_DISCLAIMER } from "./fixtures/showcase-data";

export function WorkflowDemo({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative">{children}</div>
      <figcaption>
        <span className="font-sx-mono text-[10px] uppercase tracking-[0.12em] text-sx-text-subtle">
          {label ?? DEMO_DISCLAIMER}
        </span>
      </figcaption>
    </figure>
  );
}
