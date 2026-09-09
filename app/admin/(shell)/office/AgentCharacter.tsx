"use client";

import type { AgentState, DepartmentKey } from "./office-types";

interface AgentCharacterProps {
  name: string;
  department: DepartmentKey;
  state: AgentState;
  accentColor: string;
  secondaryColor: string;
  isHermes?: boolean;
}

export function AgentCharacter({
  name,
  department,
  state,
  accentColor,
  secondaryColor,
  isHermes = false,
}: AgentCharacterProps) {
  const isWorking = state === "WORKING";
  const isThinking = state === "THINKING";
  const isBlocked = state === "BLOCKED";
  const isError = state === "ERROR";
  const isCompleted = state === "COMPLETED";

  // Distinct personality hair and attire colors per agent/department
  const getStyleTokens = () => {
    switch (department) {
      case "seo":
        return {
          hairColor: "#1e293b",
          skinColor: "#f3c69d",
          shirtColor: "#064e3b",
          jacketColor: "#0f172a",
          hairStyle: "short-fade",
        };
      case "content":
        return {
          hairColor: "#451a03",
          skinColor: "#e5b88f",
          shirtColor: "#78350f",
          jacketColor: "#1c1917",
          hairStyle: "bob-cut",
        };
      case "research":
        return {
          hairColor: "#172554",
          skinColor: "#f8d7b8",
          shirtColor: "#713f12",
          jacketColor: "#0f172a",
          hairStyle: "neat-bun",
        };
      case "website":
        return {
          hairColor: "#18181b",
          skinColor: "#eec090",
          shirtColor: "#1e3a8a",
          jacketColor: "#111827",
          hairStyle: "curly-top",
        };
      case "creative":
        return {
          hairColor: "#4c1d95",
          skinColor: "#f5cfa6",
          shirtColor: "#581c87",
          jacketColor: "#18181b",
          hairStyle: "modern-quiff",
        };
      case "operations":
        return {
          hairColor: "#111827",
          skinColor: "#dfa775",
          shirtColor: "#164e63",
          jacketColor: "#090d16",
          hairStyle: "crew-cut",
        };
      case "whatsapp":
      case "crm":
      case "sales":
        return {
          hairColor: "#27272a",
          skinColor: "#e8b88d",
          shirtColor: "#881337",
          jacketColor: "#18181b",
          hairStyle: "wavy-part",
        };
      default: // Hermes / Executive
        return {
          hairColor: "#0284c7",
          skinColor: "#e2e8f0",
          shirtColor: "#1e1b4b",
          jacketColor: "#09090b",
          hairStyle: "executive-sleek",
        };
    }
  };

  const style = getStyleTokens();

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${
        isWorking ? "" : "office-alive-breath"
      }`}
      aria-label={`${name} (${department}) - ${state}`}
    >
      {/* 1. Subtle Monitor Screen Light Spill on Character */}
      <div
        className="pointer-events-none absolute -top-4 h-24 w-24 rounded-full opacity-30 blur-xl transition-all duration-700"
        style={{
          backgroundColor: isError ? "#f43f5e" : isBlocked ? "#f59e0b" : accentColor,
        }}
      />

      {/* 2. SVG Seated Specialist Character + Ergonomic High-Back Chair */}
      <svg
        width={isHermes ? "82" : "70"}
        height={isHermes ? "90" : "78"}
        viewBox="0 0 70 78"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-2xl"
      >
        <defs>
          {/* Chair mesh gradient */}
          <linearGradient id={`chair-grad-${name}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#09090b" />
          </linearGradient>

          {/* Clothing gradient with subtle department lighting */}
          <linearGradient id={`suit-grad-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={style.jacketColor} />
            <stop offset="100%" stopColor="#0a0a0f" />
          </linearGradient>

          {/* Monitor light reflection mask */}
          <linearGradient id={`monitor-reflection-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------- */}
        {/* A. ERGONOMIC HIGH-BACK OFFICE CHAIR (Background)    */}
        {/* ---------------------------------------------------- */}
        <g id="ergonomic-chair" opacity="0.95">
          {/* Chair Headrest */}
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
          {/* Headrest bracket */}
          <rect x="33" y="12" width="4" height="4" fill="#52525b" />

          {/* Chair Mesh Backrest */}
          <path
            d="M21 16C21 14.5 22.5 13 24.5 13H45.5C47.5 13 49 14.5 49 16L51 46C51 49 48 51 45 51H25C22 51 19 49 19 46L21 16Z"
            fill={`url(#chair-grad-${name})`}
            stroke={isHermes ? "#06b6d4" : "#3f3f46"}
            strokeWidth={isHermes ? "1.5" : "1"}
          />

          {/* Ergonomic lumbar support band */}
          <path d="M22 36C28 39 42 39 48 36" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />

          {/* Armrests */}
          <rect x="14" y="38" width="5" height="14" rx="2.5" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
          <rect x="51" y="38" width="5" height="14" rx="2.5" fill="#27272a" stroke="#3f3f46" strokeWidth="0.8" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* B. SEATED WORKER (Upper Torso, Shoulders & Head)    */}
        {/* ---------------------------------------------------- */}
        <g id="worker-body">
          {/* Torso & Agency Blazer */}
          <path
            d="M23 35C23 30 26 27 30 27H40C44 27 47 30 47 35L49 56C49 58 47 60 44 60H26C23 60 21 58 21 56L23 35Z"
            fill={`url(#suit-grad-${name})`}
            stroke="#27272a"
            strokeWidth="1.2"
          />

          {/* Shirt / Inner collar with department accent */}
          <path
            d="M31 27L35 37L39 27"
            fill={style.shirtColor}
            stroke={accentColor}
            strokeWidth="1"
          />

          {/* Neck */}
          <rect x="32" y="22" width="6" height="7" fill={style.skinColor} rx="1" />

          {/* Head / Face */}
          <ellipse
            cx="35"
            cy="19"
            rx="8"
            ry="9"
            fill={style.skinColor}
          />

          {/* Hair Styling */}
          <path
            d="M27 17C27 12 30 10 35 10C40 10 43 12 43 17C43 18 41 18 39 17C37 16 33 16 31 17C29 18 27 18 27 17Z"
            fill={style.hairColor}
          />

          {/* Professional Agency Headset */}
          <path
            d="M26 18C26 12 30 9 35 9C40 9 44 12 44 18"
            stroke={isHermes ? "#06b6d4" : "#a1a1aa"}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Headset Earcups */}
          <rect x="25" y="16" width="3" height="6" rx="1.5" fill="#18181b" stroke={accentColor} strokeWidth="1" />
          <rect x="42" y="16" width="3" height="6" rx="1.5" fill="#18181b" stroke={accentColor} strokeWidth="1" />
          {/* Headset Mic boom to mouth */}
          <path d="M26 21L29 24H32" stroke="#71717a" strokeWidth="1" strokeLinecap="round" />
          <circle cx="32" cy="24" r="1" fill={accentColor} />

          {/* Eyes / Visor looking towards screens */}
          <ellipse cx="33" cy="18" rx="1.2" ry="1" fill="#1e293b" />
          <ellipse cx="37" cy="18" rx="1.2" ry="1" fill="#1e293b" />

          {/* Screen Light Reflection on Face & Collar */}
          <path
            d="M30 18C30 22 40 22 40 18C40 26 30 26 30 18Z"
            fill={`url(#monitor-reflection-${name})`}
            opacity={isWorking ? "0.8" : "0.35"}
          />

          {/* Hermes Orchestrator Holographic Halo */}
          {isHermes && (
            <g className="office-radar-sweep">
              <ellipse
                cx="35"
                cy="8"
                rx="16"
                ry="4"
                stroke="#06b6d4"
                strokeWidth="1.2"
                strokeDasharray="4 3"
                opacity="0.85"
                fill="none"
              />
            </g>
          )}

          {/* ---------------------------------------------------- */}
          {/* C. ARMS & HANDS (Working / Typing or Thinking)      */}
          {/* ---------------------------------------------------- */}
          {isWorking ? (
            // ACTIVE TYPING ARMS: Forearms extended forward with animated hands
            <g id="typing-hands">
              {/* Left Arm & Hand */}
              <g className="office-typing-l">
                <path
                  d="M22 36L18 48L24 58"
                  stroke={style.jacketColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Left hand fingers over keyboard */}
                <ellipse cx="25" cy="59" rx="3" ry="2" fill={style.skinColor} />
                <path d="M24 59L27 61" stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round" />
              </g>

              {/* Right Arm & Hand */}
              <g className="office-typing-r">
                <path
                  d="M48 36L52 48L46 58"
                  stroke={style.jacketColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Right hand fingers over keyboard */}
                <ellipse cx="45" cy="59" rx="3" ry="2" fill={style.skinColor} />
                <path d="M44 59L47 61" stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round" />
              </g>
            </g>
          ) : isThinking ? (
            // THOUGHTFUL / REVIEWING POSTURE: One hand near chin, other on desk
            <g id="thinking-arms">
              {/* Left Arm resting on desk */}
              <path
                d="M22 36L20 48L28 56"
                stroke={style.jacketColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <ellipse cx="29" cy="56" rx="3" ry="2" fill={style.skinColor} />

              {/* Right Arm touching chin/headset thoughtfully */}
              <path
                d="M48 36L50 44L41 26"
                stroke={style.jacketColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <ellipse cx="40" cy="24" rx="2.5" ry="2" fill={style.skinColor} />
            </g>
          ) : (
            // WAITING / STANDBY: Natural seated posture, hands resting near desk front
            <g id="resting-arms">
              <path
                d="M22 36L21 47L27 55"
                stroke={style.jacketColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <ellipse cx="28" cy="55" rx="3" ry="2" fill={style.skinColor} />

              <path
                d="M48 36L49 47L43 55"
                stroke={style.jacketColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <ellipse cx="42" cy="55" rx="3" ry="2" fill={style.skinColor} />
            </g>
          )}
        </g>
      </svg>

      {/* 3. Small Overhead Live Status Pip */}
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
