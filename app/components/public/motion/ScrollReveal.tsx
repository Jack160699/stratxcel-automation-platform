"use client";

import { createElement, type ReactNode } from "react";
import { useInView } from "@/lib/motion/useInView";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
};

/** Fade-up reveal on scroll — disabled when prefers-reduced-motion. */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: ScrollRevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  const reduced = useReducedMotion();

  const visible = reduced || inView;
  const delayStyle = delay > 0 ? { transitionDelay: `${delay}ms` } : undefined;

  return createElement(
    Tag,
    {
      ref,
      className: `sx-reveal ${visible ? "sx-reveal--visible" : ""} ${className}`.trim(),
      style: delayStyle,
    },
    children,
  );
}
