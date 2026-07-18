"use client";

import dynamic from "next/dynamic";
import { Mark } from "./scenes";

const Experience = dynamic(() => import("./Experience"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070e]">
      <Mark className="h-10 w-10 animate-pulse" />
    </div>
  ),
});

export default function ExperienceLoader() {
  return <Experience />;
}
