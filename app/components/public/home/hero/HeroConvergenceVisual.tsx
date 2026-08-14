"use client";

import Image from "next/image";
import { useState } from "react";
import { OFFICIAL_LOGO } from "@/lib/brand";

interface BusinessNode {
  id: string;
  label: string;
  category: string;
  signal: string;
  status: "Active" | "Synced" | "Operating";
  icon: string;
  position: string;
}

const BUSINESS_NODES: BusinessNode[] = [
  {
    id: "website",
    label: "Website",
    category: "CMS & Web",
    signal: "UX & speed optimized",
    status: "Active",
    icon: "🌐",
    position: "top-left",
  },
  {
    id: "seo",
    label: "SEO",
    category: "Search Discovery",
    signal: "Rank opportunities tracked",
    status: "Operating",
    icon: "🔍",
    position: "top-mid",
  },
  {
    id: "content",
    label: "Content",
    category: "Brand Brain",
    signal: "Voice-grounded briefs ready",
    status: "Synced",
    icon: "✍️",
    position: "top-right",
  },
  {
    id: "social",
    label: "Social",
    category: "Distribution",
    signal: "Multi-channel queue staged",
    status: "Operating",
    icon: "📱",
    position: "mid-left",
  },
  {
    id: "crm",
    label: "CRM",
    category: "Pipeline",
    signal: "Lead lifecycle synced",
    status: "Synced",
    icon: "👥",
    position: "mid-right",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    category: "Conversations",
    signal: "Inquiry response prepared",
    status: "Active",
    icon: "💬",
    position: "bottom-left",
  },
  {
    id: "marketing",
    label: "Marketing",
    category: "Campaigns",
    signal: "Ad spend & budget scoped",
    status: "Operating",
    icon: "🎯",
    position: "bottom-mid",
  },
  {
    id: "sales",
    label: "Sales",
    category: "Outreach",
    signal: "Proposals & follow-ups",
    status: "Operating",
    icon: "🤝",
    position: "bottom-right",
  },
  {
    id: "analytics",
    label: "Analytics",
    category: "Intelligence",
    signal: "Cross-channel attribution",
    status: "Synced",
    icon: "📊",
    position: "center-satellite",
  },
];

export function HeroConvergenceVisual() {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const selectedNode = activeNode
    ? BUSINESS_NODES.find((n) => n.id === activeNode)
    : null;

  return (
    <div className="relative mx-auto w-full max-w-5xl select-none pt-4">
      {/* Outer Glow Halo */}
      <div
        className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_75%_50%_at_50%_50%,rgba(58,160,255,0.12),transparent_70%)] blur-2xl"
        aria-hidden
      />

      {/* Main Board Container */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14]/80 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
        {/* Board Header / Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-sx-mono text-[11px] font-semibold tracking-wider text-white/90">
              CONNECTED BUSINESS INTELLIGENCE
            </span>
          </div>
          <div className="flex items-center gap-2 text-white/50">
            <span className="hidden font-sx-sans text-xs sm:inline">
              9 Connected Workflows
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 font-sx-mono text-[10px] uppercase text-white/70">
              Zero Hallucinations
            </span>
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 font-sx-mono text-[10px] uppercase text-sky-400">
              Human Checkpoints
            </span>
          </div>
        </div>

        {/* Convergence Visualization Grid */}
        <div className="relative my-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9 lg:gap-2.5">
          {BUSINESS_NODES.map((node) => {
            const isSelected = activeNode === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onMouseEnter={() => setActiveNode(node.id)}
                onMouseLeave={() => setActiveNode(null)}
                onClick={() => setActiveNode(isSelected ? null : node.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  isSelected
                    ? "border-sky-400/60 bg-sky-500/[0.12] shadow-[0_0_20px_rgba(58,160,255,0.25)]"
                    : "border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base" aria-hidden>
                    {node.icon}
                  </span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400/80 group-hover:animate-ping motion-reduce:hidden" />
                </div>
                <div className="mt-3">
                  <span className="block font-sx-sans text-xs font-semibold text-white">
                    {node.label}
                  </span>
                  <span className="mt-0.5 block truncate font-sx-mono text-[9px] uppercase tracking-wider text-white/40">
                    {node.category}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Central Convergence Core Engine */}
        <div className="relative mt-2 overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-950/40 via-[#0d131f] to-[#080c14] p-5 sm:p-6">
          {/* Subtle Converging Signal Lines */}
          <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(58,160,255,0.2),transparent_70%)]" />
          </div>

          <div className="relative z-10 flex flex-col items-center justify-between gap-5 sm:flex-row">
            {/* Left: Brand Identity & Converged Agent Hub */}
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-400/40 bg-sky-500/10 p-2 shadow-[0_0_24px_rgba(58,160,255,0.3)]">
                <Image
                  src={OFFICIAL_LOGO.src}
                  alt="Stratxcel AI Agent"
                  width={OFFICIAL_LOGO.width}
                  height={OFFICIAL_LOGO.height}
                  className="max-h-full max-w-full object-contain"
                  unoptimized
                />
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <h3 className="font-sx-sans text-base font-bold tracking-tight text-white sm:text-lg">
                    STRATXCEL AI AGENT
                  </h3>
                  <span className="rounded bg-sky-400/20 px-1.5 py-0.5 font-sx-mono text-[9px] font-bold uppercase tracking-wider text-sky-300">
                    Operating Core
                  </span>
                </div>
                <p className="mt-1 font-sx-sans text-xs leading-relaxed text-white/60 sm:text-[13px]">
                  {selectedNode
                    ? `Routing live context from ${selectedNode.label}: "${selectedNode.signal}"`
                    : "Connecting business systems → AI workforce → governed execution → growth."}
                </p>
              </div>
            </div>

            {/* Right: Live Telemetry Indicator */}
            <div className="flex shrink-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2">
              <div className="text-right">
                <p className="font-sx-mono text-[10px] uppercase tracking-wider text-white/40">
                  Governance
                </p>
                <p className="font-sx-sans text-xs font-semibold text-emerald-400">
                  Human Sign-off Active
                </p>
              </div>
              <div className="h-6 w-px bg-white/10" aria-hidden />
              <div className="text-right">
                <p className="font-sx-mono text-[10px] uppercase tracking-wider text-white/40">
                  Security
                </p>
                <p className="font-sx-sans text-xs font-semibold text-white/90">
                  Tenant Isolated
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Footnote */}
        <p className="mt-3.5 text-center font-sx-sans text-[11px] text-white/40">
          Illustrative system convergence. Your systems stay yours — Stratxcel connects the context with human approval.
        </p>
      </div>
    </div>
  );
}
