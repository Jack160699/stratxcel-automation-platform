"use client";

import type { AgentState, DepartmentKey, WorkerPosture } from "./office-types";
import { FileText, Code2, Image as ImageIcon, BarChart3, Database } from "lucide-react";

interface AgentCharacterProps {
  name: string;
  department: DepartmentKey;
  state: AgentState;
  accentColor: string;
  secondaryColor: string;
  isHermes?: boolean;
  posture?: WorkerPosture;
  facing?: "left" | "right";
  holdingArtifact?: { label: string; kind: string } | null;
}

export function AgentCharacter({
  name,
  department,
  state,
  accentColor,
  secondaryColor,
  isHermes = false,
  posture = "SEATED",
  facing = "right",
  holdingArtifact = null,
}: AgentCharacterProps) {
  const isWorking = state === "WORKING";
  const isThinking = state === "THINKING";
  const isBlocked = state === "BLOCKED";
  const isError = state === "ERROR";
  const isCompleted = state === "COMPLETED";

  const isSeated = posture === "SEATED";
  const isWalking = posture === "WALKING";
  const isCarrying = posture === "CARRYING";
  const isStanding = posture === "STANDING";

  // Distinct styling per department specialist
  const getStyleTokens = () => {
    switch (department) {
      case "seo":
        return {
          hairColor: "#1e293b",
          skinColor: "#f3c69d",
          shirtColor: "#064e3b",
          jacketColor: "#0f172a",
          pantsColor: "#1e293b",
        };
      case "content":
        return {
          hairColor: "#451a03",
          skinColor: "#e5b88f",
          shirtColor: "#78350f",
          jacketColor: "#1c1917",
          pantsColor: "#292524",
        };
      case "research":
        return {
          hairColor: "#172554",
          skinColor: "#f8d7b8",
          shirtColor: "#713f12",
          jacketColor: "#0f172a",
          pantsColor: "#1e293b",
        };
      case "website":
        return {
          hairColor: "#18181b",
          skinColor: "#eec090",
          shirtColor: "#1e3a8a",
          jacketColor: "#111827",
          pantsColor: "#0f172a",
        };
      case "creative":
        return {
          hairColor: "#4c1d95",
          skinColor: "#f5cfa6",
          shirtColor: "#581c87",
          jacketColor: "#18181b",
          pantsColor: "#27272a",
        };
      case "operations":
        return {
          hairColor: "#111827",
          skinColor: "#dfa775",
          shirtColor: "#164e63",
          jacketColor: "#090d16",
          pantsColor: "#1e293b",
        };
      case "whatsapp":
      case "crm":
      case "sales":
        return {
          hairColor: "#27272a",
          skinColor: "#e8b88d",
          shirtColor: "#881337",
          jacketColor: "#18181b",
          pantsColor: "#1c1917",
        };
      default: // Hermes CEO
        return {
          hairColor: "#0284c7",
          skinColor: "#e2e8f0",
          shirtColor: "#1e1b4b",
          jacketColor: "#09090b",
          pantsColor: "#09090b",
        };
    }
  };

  const style = getStyleTokens();

  // Root animation class
  let rootMotionClass = "";
  if (isWalking || isCarrying) {
    rootMotionClass = "office-walk-bob";
  } else if (!isWorking) {
    rootMotionClass = "office-alive-breath";
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${rootMotionClass}`}
      style={{
        transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
        transformOrigin: "center center",
      }}
      aria-label={`${name} (${department}) - ${state} (${posture})`}
    >
      {/* 1. Ambient Floor Aura */}
      <div
        className="pointer-events-none absolute -bottom-2 h-16 w-20 rounded-full opacity-35 blur-xl transition-all duration-500"
        style={{
          backgroundColor: isError ? "#f43f5e" : isBlocked ? "#f59e0b" : accentColor,
        }}
      />

      {/* 2. SVG Character Model (Seated vs Standing/Walking) */}
      <svg
        width={isHermes ? "82" : "70"}
        height={isSeated ? (isHermes ? "90" : "78") : (isHermes ? "104" : "96")}
        viewBox={isSeated ? "0 0 70 78" : "0 0 70 96"}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-2xl"
      >
        <defs>
          <linearGradient id={`chair-grad-${name}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#09090b" />
          </linearGradient>

          <linearGradient id={`suit-grad-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={style.jacketColor} />
            <stop offset="100%" stopColor="#0a0a0f" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------- */}
        {/* A. ERGONOMIC CHAIR (Only visible when Seated)       */}
        {/* ---------------------------------------------------- */}
        {isSeated && (
          <g id="ergonomic-chair" opacity="0.95">
            <rect
              x={isHermes ? "25" : "26"}
              y="4"
              width={isHermes ? "20" : "18"}
              height="8"
              rx="4"
              fill={`url(#chair-grad-${name})`}
              stroke="#3f3f46"
              strokeWidth="1"
            />
            <rect x="33" y="12" width="4" height="4" fill="#52525b" />
            <path
              d="M21 16C21 14.5 22.5 13 24.5 13H45.5C47.5 13 49 14.5 49 16L51 46C51 49 48 51 45 51H25C22 51 19 49 19 46L21 16Z"
              fill={`url(#chair-grad-${name})`}
              stroke={isHermes ? "#06b6d4" : "#3f3f46"}
              strokeWidth={isHermes ? "1.5" : "1"}
            />
            <path d="M22 36C28 39 42 39 48 36" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />
            <rect x="14" y="38" width="5" height="14" rx="2.5" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
            <rect x="51" y="38" width="5" height="14" rx="2.5" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
          </g>
        )}

        {/* ---------------------------------------------------- */}
        {/* B. LEGS & SHOES (Visible when Standing / Walking)   */}
        {/* ---------------------------------------------------- */}
        {!isSeated && (
          <g id="standing-legs">
            {/* Left Leg */}
            <g className={isWalking || isCarrying ? "office-leg-l" : ""}>
              <path d="M28 58L28 88" stroke={style.pantsColor} strokeWidth="6" strokeLinecap="round" />
              {/* Left Shoe */}
              <ellipse cx="28" cy="90" rx="5" ry="2.5" fill="#09090b" />
            </g>

            {/* Right Leg */}
            <g className={isWalking || isCarrying ? "office-leg-r" : ""}>
              <path d="M42 58L42 88" stroke={style.pantsColor} strokeWidth="6" strokeLinecap="round" />
              {/* Right Shoe */}
              <ellipse cx="44" cy="90" rx="5" ry="2.5" fill="#09090b" />
            </g>
          </g>
        )}

        {/* ---------------------------------------------------- */}
        {/* C. UPPER BODY & HEAD                                 */}
        {/* ---------------------------------------------------- */}
        <g id="worker-body">
          {/* Torso & Agency Blazer */}
          <path
            d="M23 35C23 30 26 27 30 27H40C44 27 47 30 47 35L49 58C49 60 47 62 44 62H26C23 62 21 60 21 58L23 35Z"
            fill={`url(#suit-grad-${name})`}
            stroke="#27272a"
            strokeWidth="1.2"
          />

          {/* Inner Shirt Collar */}
          <path d="M31 27L35 37L39 27" fill={style.shirtColor} stroke={accentColor} strokeWidth="1" />

          {/* Neck */}
          <rect x="32" y="22" width="6" height="7" fill={style.skinColor} rx="1" />

          {/* Head */}
          <ellipse cx="35" cy="19" rx="8" ry="9" fill={style.skinColor} />

          {/* Hair Styling */}
          <path
            d="M27 17C27 12 30 10 35 10C40 10 43 12 43 17C43 18 41 18 39 17C37 16 33 16 31 17C29 18 27 18 27 17Z"
            fill={style.hairColor}
          />

          {/* Audio Headset with Mic Boom */}
          <path
            d="M26 18C26 12 30 9 35 9C40 9 44 12 44 18"
            stroke={isHermes ? "#06b6d4" : "#a1a1aa"}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect x="25" y="16" width="3" height="6" rx="1.5" fill="#18181b" stroke={accentColor} strokeWidth="1" />
          <rect x="42" y="16" width="3" height="6" rx="1.5" fill="#18181b" stroke={accentColor} strokeWidth="1" />
          <path d="M26 21L29 24H32" stroke="#71717a" strokeWidth="1" strokeLinecap="round" />
          <circle cx="32" cy="24" r="1" fill={accentColor} />

          {/* Eyes */}
          <ellipse cx="33" cy="18" rx="1.2" ry="1" fill="#1e293b" />
          <ellipse cx="37" cy="18" rx="1.2" ry="1" fill="#1e293b" />

          {/* Hermes Orchestrator Radar Ring */}
          {isHermes && (
            <g className="office-radar-sweep">
              <ellipse cx="35" cy="8" rx="16" ry="4" stroke="#06b6d4" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.85" fill="none" />
            </g>
          )}

          {/* ---------------------------------------------------- */}
          {/* D. ARMS & HANDS                                      */}
          {/* ---------------------------------------------------- */}
          {isCarrying ? (
            // CARRYING POSTURE: Both arms forward holding physical deliverable
            <g id="carrying-arms">
              <path d="M22 36L28 48L34 50" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <path d="M48 36L42 48L36 50" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <ellipse cx="35" cy="50" rx="3" ry="2" fill={style.skinColor} />
            </g>
          ) : isWalking ? (
            // WALKING NATURAL ARM SWING
            <g id="walking-arms">
              <path d="M22 36L18 50L24 56" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <path d="M48 36L52 50L46 56" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
            </g>
          ) : isWorking ? (
            // ACTIVE TYPING ARMS
            <g id="typing-hands">
              <g className="office-typing-l">
                <path d="M22 36L18 48L24 58" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <ellipse cx="25" cy="59" rx="3" ry="2" fill={style.skinColor} />
              </g>
              <g className="office-typing-r">
                <path d="M48 36L52 48L46 58" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <ellipse cx="45" cy="59" rx="3" ry="2" fill={style.skinColor} />
              </g>
            </g>
          ) : isThinking ? (
            // THOUGHTFUL POSTURE
            <g id="thinking-arms">
              <path d="M22 36L20 48L28 56" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <path d="M48 36L50 44L41 26" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <ellipse cx="40" cy="24" rx="2.5" ry="2" fill={style.skinColor} />
            </g>
          ) : (
            // RELAXED STANDBY ARMS
            <g id="resting-arms">
              <path d="M22 36L21 47L27 55" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <path d="M48 36L49 47L43 55" stroke={style.jacketColor} strokeWidth="4" strokeLinecap="round" />
              <ellipse cx="28" cy="55" rx="3" ry="2" fill={style.skinColor} />
              <ellipse cx="42" cy="55" rx="3" ry="2" fill={style.skinColor} />
            </g>
          )}
        </g>
      </svg>

      {/* 3. Carried Physical Deliverable / Folder Badge */}
      {isCarrying && holdingArtifact && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-lg border border-white/20 bg-slate-900/95 px-2 py-0.5 shadow-2xl backdrop-blur-md office-artifact-float office-handoff-beacon"
          style={{
            transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
          }}
        >
          <FileText className="h-3 w-3 text-cyan-400 shrink-0" />
          <span className="font-mono text-[8px] font-bold text-white tracking-wider truncate max-w-[80px]">
            {holdingArtifact.label}
          </span>
        </div>
      )}

      {/* 4. Small Overhead Live Status Pip */}
      <div className="absolute -top-1 right-2 flex items-center">
        <span
          className="flex h-2.5 w-2.5 items-center justify-center rounded-full border border-slate-900 shadow-md"
          style={{
            backgroundColor: isError
              ? "#ef4444"
              : isBlocked
              ? "#f59e0b"
              : isWorking
              ? "#10b981"
              : isCompleted
              ? "#38bdf8"
              : "#64748b",
          }}
        >
          {isWorking && (
            <span className="office-beacon absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
        </span>
      </div>
    </div>
  );
}
