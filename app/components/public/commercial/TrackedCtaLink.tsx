"use client";

import Link from "next/link";
import type { FunnelEvent, FunnelProps } from "@/lib/analytics/events";
import { trackFunnel } from "@/lib/analytics/events";

export function TrackedCtaLink({
  href,
  children,
  className,
  event,
  surface,
  plan,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  event?: FunnelEvent;
  surface?: string;
  plan?: string;
  onClick?: () => void;
}) {
  const props: FunnelProps = {};
  if (surface) props.surface = surface;
  if (plan) props.plan = plan;
  return (
    <Link href={href} className={className} onClick={() => { if (event) trackFunnel(event, props); onClick?.(); }}>
      {children}
    </Link>
  );
}
