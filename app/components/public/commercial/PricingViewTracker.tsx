"use client";

import { useEffect } from "react";
import { trackFunnel } from "@/lib/analytics/events";

export function PricingViewTracker({ surface = "pricing_page" }: { surface?: string }) {
  useEffect(() => { trackFunnel("view_pricing", { surface }); }, [surface]);
  return null;
}
