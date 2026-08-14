"use client";

import React, { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewed = sessionStorage.getItem("stratxcel_intro_viewed");
    return !(prefersReducedMotion || viewed === "true");
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

export function CinematicWebEntrance() {
  const shouldPlayOnMount = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0); // 1: Line 1, 2: Line 2, 3: Line 3 (The Stop), 4: Brand Reveal
  const [exitStep, setExitStep] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speedMultiplierRef = useRef<number>(1.6);
  const timeRef = useRef<number>(0);

  // Initialize Web Audio API Synthesizer
  const getAudioCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const playShimmer = useCallback(
    (freq = 440) => {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.8, ctx.currentTime + 0.4);

        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch {}
    },
    [getAudioCtx]
  );

  const playSubDrop = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 0.9);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch {}
  }, [getAudioCtx]);

  const playCobaltChime = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const freqs = [440, 554.37, 659.25, 880, 1318.5];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.05);

        gain.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.05 + 1.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + 1.8);
      });
    } catch {}
  }, [getAudioCtx]);

  const clearAllTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const endIntro = useCallback(() => {
    clearAllTimers();
    setIsPlaying(false);
    setIsComplete(true);
    speedMultiplierRef.current = 0.45; // Calm fluid motion for live background
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("stratxcel_intro_viewed", "true");
      } catch {}
    }
  }, [clearAllTimers]);

  // WebGL 60fps Liquid Cobalt Shader Engine
  const initFluidShader = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl =
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      // 2D Fallback
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render2D = () => {
        timeRef.current += 0.01;
        const w = canvas.width;
        const h = canvas.height;
        const grad = ctx.createRadialGradient(
          w * 0.5 + Math.sin(timeRef.current) * 100,
          h * 0.5 + Math.cos(timeRef.current * 0.8) * 80,
          50,
          w * 0.5,
          h * 0.5,
          w * 0.7
        );
        grad.addColorStop(0, "#0047FF");
        grad.addColorStop(0.5, "#001A80");
        grad.addColorStop(1, "#020408");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        animFrameRef.current = requestAnimationFrame(render2D);
      };
      render2D();
      return;
    }

    glRef.current = gl;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_speed;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.x *= u_resolution.x / u_resolution.y;

        float t = u_time * 0.25 * u_speed;

        vec2 q = vec2(0.0);
        q.x = snoise(st * 1.6 + vec2(t * 0.4, t * 0.3));
        q.y = snoise(st * 1.6 + vec2(t * 0.2, t * 0.5));

        vec2 r = vec2(0.0);
        r.x = snoise(st * 2.2 + q * 1.8 + vec2(1.7, 9.2) + 0.3 * t);
        r.y = snoise(st * 2.2 + q * 1.8 + vec2(8.3, 2.8) + 0.3 * t);

        float f = snoise(st * 2.0 + r * 2.2);

        vec3 colObsidian = vec3(0.008, 0.015, 0.031);
        vec3 colNavy     = vec3(0.0, 0.06, 0.22);
        vec3 colCobalt   = vec3(0.0, 0.278, 1.0);
        vec3 colSapphire = vec3(0.23, 0.51, 1.0);

        vec3 color = mix(colObsidian, colNavy, clamp(f * f * 3.5, 0.0, 1.0));
        color = mix(color, colCobalt, clamp(length(q) * 0.65, 0.0, 1.0));
        color = mix(color, colSapphire, clamp(length(r.x) * 0.35, 0.0, 1.0));

        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
        vignette = clamp(pow(16.0 * vignette, 0.35), 0.0, 1.0);

        gl_FragColor = vec4(color * vignette, 1.0);
      }
    `;

    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    programRef.current = program;

    const posAttr = gl.getAttribLocation(program, "a_position");
    const resUniform = gl.getUniformLocation(program, "u_resolution");
    const timeUniform = gl.getUniformLocation(program, "u_time");
    const speedUniform = gl.getUniformLocation(program, "u_speed");

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const render = () => {
      if (!gl || !programRef.current) return;
      timeRef.current += 0.015;

      gl.useProgram(programRef.current);
      gl.enableVertexAttribArray(posAttr);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(resUniform, canvas.width, canvas.height);
      gl.uniform1f(timeUniform, timeRef.current);
      gl.uniform1f(speedUniform, speedMultiplierRef.current);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
  }, []);

  // Window resize handler for fluid canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        if (glRef.current) {
          glRef.current.viewport(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Cinematic Timeline Orchestrator
  const playSequence = useCallback(() => {
    clearAllTimers();
    setIsPlaying(true);
    setIsComplete(false);
    setActiveStep(0);
    setExitStep(0);
    speedMultiplierRef.current = 1.6;

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timeoutsRef.current.push(id);
      return id;
    };

    // 00:00.0 - 00:02.0: Line 1 Writing In
    schedule(() => {
      setActiveStep(1);
      playShimmer(480);
    }, 300);

    // 00:02.0 - 00:03.5: Line 1 Exits, Line 2 Writes In
    schedule(() => {
      setExitStep(1);
    }, 1900);

    schedule(() => {
      setActiveStep(2);
      playShimmer(560);
    }, 2200);

    // 00:03.5 - 00:04.8: Line 2 Exits, Line 3 "The Stop / Insight" Appears with Sub Bass
    schedule(() => {
      setExitStep(2);
    }, 3600);

    schedule(() => {
      setActiveStep(3);
      playSubDrop();
    }, 3900);

    // 00:04.8 - 00:06.2: Line 3 Exits, Stratxcel 3D Cobalt Logo Resolves
    schedule(() => {
      setExitStep(3);
    }, 4900);

    schedule(() => {
      setActiveStep(4);
      playCobaltChime();
    }, 5100);

    // 00:06.2 - 00:07.0: Smooth Dissolve into Homepage Hero
    schedule(() => {
      endIntro();
    }, 6800);
  }, [clearAllTimers, endIntro, playCobaltChime, playShimmer, playSubDrop]);

  // Initial mount lifecycle
  useEffect(() => {
    initFluidShader();
    if (shouldPlayOnMount) {
      const timer = setTimeout(() => {
        playSequence();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [shouldPlayOnMount, initFluidShader, playSequence]);

  // Keyboard shortcut: ESC to skip
  useEffect(() => {
    if (!isPlaying) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        endIntro();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, endIntro]);

  // Register global replay hook
  useEffect(() => {
    (window as unknown as { __replayStratxcelIntro?: () => void }).__replayStratxcelIntro = () => {
      playSequence();
    };
    return () => {
      delete (window as unknown as { __replayStratxcelIntro?: () => void }).__replayStratxcelIntro;
    };
  }, [playSequence]);

  return (
    <>
      {/* SVG Defs for 3D Interlocking Dual-Orbital Stratxcel Emblem */}
      <svg style={{ display: "none" }}>
        <defs>
          <linearGradient id="stratxcel-blue-outer" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="35%" stopColor="#0055FF" />
            <stop offset="70%" stopColor="#0037CC" />
            <stop offset="100%" stopColor="#001F80" />
          </linearGradient>

          <linearGradient id="stratxcel-bevel-light" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#001858" />
          </linearGradient>

          <linearGradient id="stratxcel-inner-glow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="50%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>

          <g id="stratxcel-emblem-vector">
            {/* Back Orbital Loop */}
            <path
              d="M 30,120 C 15,70 45,20 100,20 C 155,20 185,70 170,120 C 155,170 125,180 100,180 C 75,180 45,170 30,120 Z"
              fill="none"
              stroke="url(#stratxcel-blue-outer)"
              strokeWidth="22"
              strokeLinecap="round"
              transform="rotate(-28 100 100)"
            />
            {/* Specular Highlight Bevel on Back Loop */}
            <path
              d="M 36,115 C 22,72 48,26 98,24 C 148,22 176,68 164,115"
              fill="none"
              stroke="url(#stratxcel-bevel-light)"
              strokeWidth="5"
              transform="rotate(-28 100 100)"
            />
            {/* Intersecting Fore Orbital Loop */}
            <path
              d="M 30,120 C 15,70 45,20 100,20 C 155,20 185,70 170,120 C 155,170 125,180 100,180 C 75,180 45,170 30,120 Z"
              fill="none"
              stroke="url(#stratxcel-blue-outer)"
              strokeWidth="22"
              strokeLinecap="round"
              transform="rotate(38 100 100)"
            />
            {/* Specular Highlight Bevel on Fore Loop */}
            <path
              d="M 36,115 C 22,72 48,26 98,24 C 148,22 176,68 164,115"
              fill="none"
              stroke="url(#stratxcel-bevel-light)"
              strokeWidth="5"
              transform="rotate(38 100 100)"
            />
            {/* Interlocking Precision Cross Bridge */}
            <path
              d="M 78,56 C 88,48 112,48 122,56 C 132,64 125,84 100,98 C 75,112 68,132 78,144"
              fill="none"
              stroke="url(#stratxcel-inner-glow)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </g>
        </defs>
      </svg>

      {/* Watery Fluid Background Canvas (WebGL Shader / 2D Fallback) */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 h-screen w-screen scale-105 filter blur-[26px] saturate-[1.25] contrast-[1.15] transition-opacity duration-1000"
      />

      {/* Cinematic Film Grain Static Texture Overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.055]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Vignette Overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(2, 4, 8, 0.05) 0%, rgba(2, 4, 8, 0.7) 75%, rgba(1, 2, 5, 0.95) 100%)",
        }}
      />

      {/* CINEMATIC INTRO STAGE OVERLAY (00:00 - 00:06.8) */}
      {(!isComplete || isPlaying) && (
        <div
          role="dialog"
          aria-label="Stratxcel Brand Entrance"
          aria-modal="true"
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020408]/90 text-white transition-all duration-1000 select-none ${
            isPlaying ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Skip Intro Button */}
          <button
            type="button"
            onClick={endIntro}
            className="absolute bottom-8 right-9 z-[120] flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 font-sx-mono text-[11px] font-semibold tracking-wider text-slate-300 uppercase backdrop-blur-xl transition-all hover:border-blue-500 hover:bg-blue-600/25 hover:text-white"
          >
            <span>Skip Intro</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white">ESC</kbd>
          </button>

          {/* Liquid Typography Stage */}
          <div className="relative flex min-h-[220px] w-[90vw] max-w-[920px] flex-col items-center justify-center text-center">
            {/* Line 1: The Problem (00:00 - 00:02) */}
            <div
              className={`absolute max-w-[860px] font-sx-sans text-[clamp(28px,4.2vw,52px)] font-bold tracking-tight text-white leading-snug transition-all duration-600 ${
                activeStep === 1 && exitStep !== 1
                  ? "opacity-100 scale-100 blur-0 translate-y-0"
                  : exitStep === 1
                  ? "opacity-0 scale-105 blur-md -translate-y-4 pointer-events-none"
                  : "opacity-0 scale-95 blur-md translate-y-4 pointer-events-none"
              }`}
              style={{
                textShadow: "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 71, 255, 0.35)",
              }}
            >
              Running a business creates{" "}
              <span className="text-blue-300 drop-shadow-[0_0_24px_rgba(0,71,255,0.7)]">
                too much digital work.
              </span>
            </div>

            {/* Line 2: The Reality (00:02 - 00:03.5) */}
            <div
              className={`absolute max-w-[860px] font-sx-sans text-[clamp(26px,3.8vw,48px)] font-bold tracking-tight text-white leading-snug transition-all duration-600 ${
                activeStep === 2 && exitStep !== 2
                  ? "opacity-100 scale-100 blur-0 translate-y-0"
                  : exitStep === 2
                  ? "opacity-0 scale-105 blur-md -translate-y-4 pointer-events-none"
                  : "opacity-0 scale-95 blur-md translate-y-4 pointer-events-none"
              }`}
              style={{
                textShadow: "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 71, 255, 0.35)",
              }}
            >
              You didn’t start your business to spend your day managing everything online.
            </div>

            {/* Line 3: The Insight / The Stop (00:03.5 - 00:04.8) */}
            <div
              className={`absolute max-w-[860px] font-sx-sans text-[clamp(28px,4.5vw,54px)] font-extrabold tracking-tight text-white leading-tight transition-all duration-600 ${
                activeStep === 3 && exitStep !== 3
                  ? "opacity-100 scale-100 blur-0 translate-y-0"
                  : exitStep === 3
                  ? "opacity-0 scale-105 blur-md -translate-y-4 pointer-events-none"
                  : "opacity-0 scale-95 blur-md translate-y-4 pointer-events-none"
              }`}
              style={{
                textShadow: "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 71, 255, 0.45)",
              }}
            >
              You need the work{" "}
              <span className="text-blue-300 drop-shadow-[0_0_28px_rgba(0,71,255,0.85)]">
                to get done.
              </span>
            </div>

            {/* Act 4: Stratxcel 3D Cobalt Reveal (00:04.8 - 00:06.5) */}
            <div
              className={`absolute flex flex-col items-center justify-center transition-all duration-800 ${
                activeStep === 4
                  ? "opacity-100 scale-100 blur-0 translate-y-0"
                  : "opacity-0 scale-90 blur-xl translate-y-6 pointer-events-none"
              }`}
            >
              <div className="relative mb-6 h-32 w-32 filter drop-shadow-[0_15px_45px_rgba(0,71,255,0.85)] animate-float">
                <svg viewBox="0 0 200 200" width="100%" height="100%">
                  <use href="#stratxcel-emblem-vector" />
                </svg>
              </div>
              <h2 className="font-sx-sans text-3xl sm:text-5xl font-extrabold tracking-[0.22em] text-white uppercase drop-shadow-[0_4px_24px_rgba(0,71,255,0.6)]">
                STRATXCEL
              </h2>
              <p className="mt-2 font-sx-mono text-xs sm:text-sm font-semibold tracking-[0.26em] text-blue-300 uppercase">
                Your AI Business Agent
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
