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

  // Animation class based on state
  let motionClass = "office-float";
  if (isWorking) motionClass = "office-typing-active";
  if (isThinking) motionClass = "office-float-delayed";

  return (
    <div className={`relative flex flex-col items-center justify-center ${motionClass}`}>
      {/* State Glow Aura */}
      <div
        className="absolute -inset-2 rounded-full opacity-40 blur-md transition-all duration-500"
        style={{
          backgroundColor: isError
            ? "#f43f5e"
            : isBlocked
            ? "#f59e0b"
            : isCompleted
            ? "#10b981"
            : accentColor,
        }}
      />

      {/* SVG Stylized Avatar */}
      <svg
        width={isHermes ? "52" : "44"}
        height={isHermes ? "64" : "56"}
        viewBox="0 0 52 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-xl"
        aria-hidden="true"
      >
        {/* Hermes Crown / Holographic Orbit */}
        {isHermes && (
          <g className="office-beacon">
            <ellipse
              cx="26"
              cy="10"
              rx="18"
              ry="4"
              stroke="#06b6d4"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              fill="none"
              opacity="0.85"
            />
          </g>
        )}

        {/* Head / Helmet */}
        <ellipse cx="26" cy="20" rx="12" ry="12" fill="#0f172a" stroke={accentColor} strokeWidth="2" />

        {/* Visor / Face Screen */}
        <rect
          x="18"
          y="16"
          width="16"
          height="7"
          rx="3.5"
          fill={isError ? "#ef4444" : isBlocked ? "#f59e0b" : accentColor}
          opacity="0.9"
        />

        {/* Visor Eye Glow */}
        <circle
          cx={isWorking ? "23" : "26"}
          cy="19.5"
          r="1.8"
          fill="#ffffff"
          className={isWorking ? "animate-ping" : ""}
        />
        {isWorking && <circle cx="29" cy="19.5" r="1.8" fill="#ffffff" />}

        {/* Torso / Suit */}
        <path
          d="M16 34C16 31 18 29 21 29H31C34 29 36 31 36 34L38 48C38 50 36 52 34 52H18C16 52 14 50 14 48L16 34Z"
          fill="#1e293b"
          stroke={secondaryColor}
          strokeWidth="1.5"
        />

        {/* Core Reactor / Badge */}
        <circle
          cx="26"
          cy="39"
          r="4.5"
          fill={accentColor}
          opacity="0.85"
          className={isWorking ? "animate-pulse" : ""}
        />
        <circle cx="26" cy="39" r="2" fill="#ffffff" />

        {/* Arms / Hands */}
        {isWorking ? (
          // Typing Hands on Desk
          <g className="office-typing-active">
            <path d="M14 36L10 44L16 46" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
            <path d="M38 36L42 44L36 46" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
          </g>
        ) : (
          // Rest Posture
          <g>
            <path d="M15 36L13 46" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
            <path d="M37 36L39 46" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
      </svg>

      {/* Floating Mini Status Orb */}
      <span
        className="absolute -top-1 right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-slate-900 shadow-md"
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
          <span className="office-beacon absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
      </span>
    </div>
  );
}
