import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-sx-accent text-sx-accent-on shadow-[0_1px_2px_rgb(10_16_32/0.06),0_8px_24px_-8px_rgb(37_99_235/0.35)] hover:bg-[color:var(--sx-accent-hover)]",
  secondary:
    "border border-sx-border-strong bg-sx-surface-1 text-sx-text hover:bg-sx-surface-2",
  ghost: "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text",
};

type BaseProps = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

type LinkProps = BaseProps &
  ComponentPropsWithoutRef<typeof Link> & {
    href: string;
  };

type ButtonProps = BaseProps &
  ComponentPropsWithoutRef<"button"> & {
    href?: undefined;
  };

export function PublicButton(props: LinkProps | ButtonProps) {
  const { variant = "primary", children, className = "", ...rest } = props;
  const classes = [
    "inline-flex min-h-11 items-center justify-center rounded-sx-sm px-7 py-3 font-sx-sans text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none",
    variantClass[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if ("href" in rest && rest.href) {
    const { href, ...linkRest } = rest as LinkProps;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonProps)}>
      {children}
    </button>
  );
}
