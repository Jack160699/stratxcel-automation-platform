"use client";

import type { LiveWorkflowEdge } from "./office-types";
import { FileText, Code2, Image, BarChart3, Database } from "lucide-react";

interface DataTrackProps {
  workflows: LiveWorkflowEdge[];
  workerPositions: Record<string, { x: number; y: number }>;
}

export function DataTrack({ workflows, workerPositions }: DataTrackProps) {
  if (workflows.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-15 overflow-visible">
      <svg className="h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="office-data-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
          </linearGradient>
          <filter id="office-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {workflows.map((wf) => {
          const from = workerPositions[wf.fromWorkerId];
          const to = workerPositions[wf.toWorkerId];
          if (!from || !to) return null;

          // Bezier curve connecting workstations
          const midX = (from.x + to.x) / 2;
          const midY = Math.min(from.y, to.y) - 40;
          const pathD = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;

          return (
            <g key={wf.id}>
              {/* Underlying Conduit Path */}
              <path
                d={pathD}
                fill="none"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />

              {/* Glowing Pulse Path */}
              <path
                d={pathD}
                fill="none"
                stroke="url(#office-data-gradient)"
                strokeWidth="2.5"
                filter="url(#office-glow)"
                opacity="0.75"
              />

              {/* Animated Data Packet */}
              <circle r="4.5" fill="#38bdf8" filter="url(#office-glow)">
                <animateMotion
                  path={pathD}
                  dur="2.5s"
                  repeatCount="indefinite"
                  rotate="auto"
                />
              </circle>

              {/* Traveling Document Tag */}
              <g>
                <animateMotion
                  path={pathD}
                  dur="2.5s"
                  repeatCount="indefinite"
                  rotate="auto"
                />
                <rect
                  x="-24"
                  y="-18"
                  width="48"
                  height="14"
                  rx="4"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1"
                  opacity="0.9"
                />
                <text
                  x="0"
                  y="-8"
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="8"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {wf.fileType?.toUpperCase() || "DATA"}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
