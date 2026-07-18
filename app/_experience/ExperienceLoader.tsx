"use client";

import dynamic from "next/dynamic";

// No loading UI: the server-rendered gate shell in app/page.tsx stays on
// screen until the experience mounts and removes it.
const Experience = dynamic(() => import("./Experience"), { ssr: false });

export default function ExperienceLoader() {
  return <Experience />;
}
