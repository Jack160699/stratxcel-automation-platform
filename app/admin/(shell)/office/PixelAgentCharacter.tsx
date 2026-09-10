"use client";

import { useState } from "react";
import type { AgentState, DepartmentKey, WorkerPosture } from "./office-types";
import {
  FileText,
  Search,
  Code2,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  HelpCircle,
  Lightbulb,
  ArrowRight,
  Database,
} from "lucide-react";

interface PixelAgentCharacterProps {
  name: string;
  department: DepartmentKey;
  state: AgentState;
  accentColor: string;
  secondaryColor: string;
  isHermes?: boolean;
  posture?: WorkerPosture;
  facing?: "left" | "right";
  holdingArtifact?: { label: string; kind: string } | null;
  transferTargetName?: string | null;
  transferLabel?: string | null;
  thoughtIcon?: "?" | "!" | "lightbulb" | "coffee" | "wrench" | "folder" | null;
  onClick?: () => void;
  onHover?: () => void;
}

export function PixelAgentCharacter({
  name,
  department,
  state,
  accentColor,
  secondaryColor,
  isHermes = false,
  posture = "SEATED",
  facing = "right",
  holdingArtifact = null,
  transferTargetName = null,
  transferLabel = null,
  thoughtIcon = null,
  onClick,
  onHover,
}: PixelAgentCharacterProps) {
  const isWorking = state === "WORKING" || state === "SEARCHING" || state === "GENERATING" || state === "ANALYZING";
  const isWalking = posture === "WALKING" || posture === "CARRYING";
  const isMeeting = state === "MEETING";
  const isBlocked = state === "BLOCKED" || state === "ERROR";
  const isCoffee = state === "COFFEE" || state === "BREAK";

  // Role Badge text (Matching reference: PM_AGENT, DEV_AGENT, DESIGN_AGENT, etc.)
  const getBadgeTitle = () => {
    if (isHermes) return "HERMES_CEO";
    switch (department) {
      case "research":
        return "MAYA_RESEARCH";
      case "sales":
      case "crm":
      case "whatsapp":
        return "LIAM_SALES";
      case "engineering":
      case "website":
        return "DEV_AGENT";
      case "content":
      case "creative":
        return "DESIGN_AGENT";
      case "finance":
        return "FINANCE_AGENT";
      case "seo":
        return "SEO_AGENT";
      default:
        return `${name.toUpperCase()}_AGENT`;
    }
  };

  // Color tokens per specialist
  const getAgentPalette = () => {
    if (isHermes) {
      return { hair: "#0284c7", skin: "#fcd34d", shirt: "#1e1b4b", pants: "#09090b", shoes: "#0284c7" };
    }
    switch (department) {
      case "research":
        return { hair: "#1e293b", skin: "#fcd34d", shirt: "#0284c7", pants: "#1e293b", shoes: "#38bdf8" };
      case "sales":
        return { hair: "#3f3f46", skin: "#fed7aa", shirt: "#e11d48", pants: "#18181b", shoes: "#f43f5e" };
      case "engineering":
        return { hair: "#1c1917", skin: "#fde047", shirt: "#2563eb", pants: "#0f172a", shoes: "#60a5fa" };
      case "content":
      case "creative":
        return { hair: "#831843", skin: "#fed7aa", shirt: "#9333ea", pants: "#27272a", shoes: "#c084fc" };
      case "finance":
        return { hair: "#451a03", skin: "#fcd34d", shirt: "#d97706", pants: "#18181b", shoes: "#fbbf24" };
      default:
        return { hair: "#1e293b", skin: "#fcd34d", shirt: "#059669", pants: "#1e293b", shoes: "#34d399" };
    }
  };

  const pal = getAgentPalette();
  const badgeTitle = getBadgeTitle();

  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none transition-transform duration-200 group ${
        isWalking ? "animate-bounce" : ""
      }`}
      style={{
        transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
        transformOrigin: "center center",
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. FLOATING THOUGHT BUBBLE (MATCHING REF)                      */}
      {/* ------------------------------------------------------------- */}
      {(thoughtIcon || isWorking || isBlocked || isCoffee) && (
        <div
          className="absolute -top-11 z-30 flex items-center justify-center rounded-lg bg-white/95 border-2 border-black px-1.5 py-0.5 shadow-md animate-pulse"
          style={{ transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)" }}
        >
          {isBlocked ? (
            <AlertTriangle size={12} className="text-red-500 font-bold" />
          ) : isCoffee ? (
            <Coffee size={12} className="text-amber-700" />
          ) : thoughtIcon === "?" ? (
            <span className="text-[11px] font-bold text-blue-600 font-mono">?</span>
          ) : thoughtIcon === "!" ? (
            <span className="text-[11px] font-bold text-amber-500 font-mono">!</span>
          ) : state === "SEARCHING" ? (
            <Search size={12} className="text-cyan-600" />
          ) : state === "ANALYZING" ? (
            <Database size={12} className="text-indigo-600" />
          ) : isWorking ? (
            <Code2 size={12} className="text-emerald-600" />
          ) : (
            <span className="text-[10px] font-bold text-zinc-700">💭</span>
          )}
          {/* Bubble pointer triangle */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black" />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. PIXEL ROLE BADGE (MATCHING REF: [ PM_AGENT ], [ DEV_AGENT ])*/}
      {/* ------------------------------------------------------------- */}
      <div
        className="absolute -top-5 z-20 flex items-center gap-1 rounded bg-black/90 border border-zinc-500 px-1.5 py-0.2 shadow text-[9px] font-bold font-mono tracking-wider text-white uppercase whitespace-nowrap group-hover:border-cyan-400 group-hover:text-cyan-300 transition"
        style={{ transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <span>{badgeTitle}</span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. PIXEL SPRITE BODY (HIGH-DENSITY CRISP PIXEL ART)            */}
      {/* ------------------------------------------------------------- */}
      <svg
        width="48"
        height="56"
        viewBox="0 0 24 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
        shapeRendering="crispEdges"
      >
        {/* Hair */}
        <rect x="7" y="2" width="10" height="4" fill={pal.hair} />
        <rect x="6" y="4" width="2" height="5" fill={pal.hair} />
        <rect x="16" y="4" width="2" height="5" fill={pal.hair} />
        <rect x="8" y="1" width="8" height="2" fill={pal.hair} />

        {/* Head / Skin */}
        <rect x="8" y="5" width="8" height="7" fill={pal.skin} />
        {/* Eyes (Pixel squares) */}
        <rect x="10" y="7" width="2" height="2" fill="#09090b" />
        <rect x="14" y="7" width="2" height="2" fill="#09090b" />
        {/* Smile */}
        <rect x="11" y="10" width="3" height="1" fill="#713f12" />

        {/* Torso & Suit / Shirt */}
        <rect x="6" y="12" width="12" height="8" fill={pal.shirt} />
        {/* Tie / Inner accent */}
        <rect x="11" y="13" width="2" height="5" fill={accentColor} />

        {/* Left Arm & Right Arm */}
        <rect x="4" y="13" width="2" height="6" fill={pal.shirt} />
        <rect x="18" y="13" width="2" height="6" fill={pal.shirt} />
        {/* Hands */}
        <rect x="4" y="19" width="2" height="2" fill={pal.skin} />
        <rect x="18" y="19" width="2" height="2" fill={pal.skin} />

        {/* Legs / Pants */}
        <rect x="8" y="20" width="3" height="6" fill={pal.pants} />
        <rect x="13" y="20" width="3" height="6" fill={pal.pants} />

        {/* Shoes */}
        <rect x="7" y="26" width="4" height="2" fill={pal.shoes} />
        <rect x="13" y="26" width="4" height="2" fill={pal.shoes} />

        {/* Working Keyboard / Laptop when active */}
        {isWorking && (
          <g>
            <rect x="6" y="18" width="12" height="3" fill="#18181b" />
            <rect x="7" y="19" width="10" height="1" fill="#38bdf8" />
          </g>
        )}
      </svg>

      {/* ------------------------------------------------------------- */}
      {/* 4. VISIBLE WORK TRANSFER ARROW (MATCHING REF)                  */}
      {/* ------------------------------------------------------------- */}
      {transferTargetName && transferLabel && (
        <div
          className="absolute -right-28 top-3 z-40 flex items-center gap-1 rounded bg-black/90 border border-cyan-400 px-2 py-0.5 text-[9px] font-bold font-mono text-cyan-300 shadow-lg animate-pulse"
          style={{ transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)" }}
        >
          <span>{transferLabel}</span>
          <ArrowRight size={11} className="text-cyan-400" />
          <span className="text-emerald-400">{transferTargetName}</span>
        </div>
      )}

      {/* Floor Glow */}
      <div
        className="pointer-events-none absolute -bottom-1 h-3 w-10 rounded-full opacity-60 blur-xs transition"
        style={{ backgroundColor: accentColor }}
      />
    </div>
  );
}
