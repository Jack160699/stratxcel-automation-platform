import type { ReactNode } from "react";

type PublicSectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  /** data-home-section value for homepage QA hooks */
  sectionKey?: string;
};

/** Reusable public marketing section shell with consistent max-width and rhythm. */
export function PublicSection({ id, children, className = "", sectionKey }: PublicSectionProps) {
  return (
    <section
      id={id}
      data-home-section={sectionKey}
      className={`mx-auto max-w-[var(--sx-public-max-width)] px-4 py-[var(--sx-public-section-y)] sm:px-6 lg:px-8 ${className}`}
    >
      {children}
    </section>
  );
}
