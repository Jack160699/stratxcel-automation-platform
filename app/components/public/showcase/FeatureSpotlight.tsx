import type { ReactNode } from "react";

export function FeatureSpotlight({
  eyebrow = "Product interface",
  title,
  description,
  children,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <header className={`flex flex-col gap-2 ${align === "center" ? "items-center text-center" : ""}`}>
      <p className="font-sx-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-sx-accent">{eyebrow}</p>
      <h3 className="font-sx-sans text-xl font-semibold tracking-tight text-sx-text sm:text-2xl">{title}</h3>
      {description && <p className="max-w-2xl text-sm leading-relaxed text-sx-text-muted">{description}</p>}
      {children}
    </header>
  );
}
