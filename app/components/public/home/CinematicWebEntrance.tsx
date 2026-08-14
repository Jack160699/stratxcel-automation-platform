"use client";

import React, { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";

/* ─── Session / Reduced-Motion External Store ────────────────────────────── */

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

/* ─── Notification Badge Data (Act 2: Digital Overload) ──────────────────── */

const OVERLOAD_BADGES = [
  { text: "42 Unanswered WhatsApp Leads", position: "top-[12%] left-[8%]", delay: 0 },
  { text: "Slot Conflict: 11:30 AM", position: "top-[22%] right-[10%]", delay: 300 },
  { text: "Ad Campaign Stalled (Low ROAS)", position: "top-[42%] left-[5%]", delay: 500 },
  { text: "5 Overdue Invoices", position: "bottom-[30%] right-[6%]", delay: 700 },
  { text: "Pending Review: Instagram Post", position: "bottom-[18%] left-[12%]", delay: 900 },
];

/* ─── Business Character Micro-Shots (Act 1: Real Business Life) ─────────── */

const BUSINESS_SHOTS = [
  { name: "Kabir", role: "Gym Owner, Pune", action: "Unlocking the iron shutter. Dawn sunlight cuts through chalk dust." },
  { name: "Priya", role: "Café Owner, Bengaluru", action: "Tamping fresh espresso into the portafilter. Steam backlit by window light." },
  { name: "Meera", role: "Salon Owner, Mumbai", action: "Aligning shears in front of clean studio mirrors." },
  { name: "Rohan", role: "Apparel Store, Jaipur", action: "Folding heritage textiles, arranging the wooden counter." },
  { name: "Ananya", role: "Aspiring Founder, Raipur", action: "Sketching workflow architecture beside a slim laptop." },
];

/* ─── Main Component ─────────────────────────────────────────────────────── */

export function CinematicWebEntrance() {
  const shouldPlayOnMount = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  // Act states: 0=idle, 1=business shots, 2=overload, 3=the stop, 4=brand reveal
  const [currentAct, setCurrentAct] = useState<number>(0);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [visibleBadges, setVisibleBadges] = useState<number[]>([]);
  const [textPhase, setTextPhase] = useState<number>(0); // 0=none, 1=line1, 2=line2, 3=line3+hindi, 4=brand
  const [exitPhase, setExitPhase] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speedMultiplierRef = useRef<number>(1.6);
  const timeRef = useRef<number>(0);

  /* ─── Web Audio API Sound Design Synthesizer ───────────────────────────── */

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

  // Foley-like tactile taps (Act 1: Real Business Life)
  const playFoleyTap = useCallback(
    (freq = 280) => {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {}
    },
    [getAudioCtx]
  );

  // Room tone (40Hz sub-hum)
  const roomToneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const startRoomTone = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx || roomToneRef.current) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(40, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      roomToneRef.current = { osc, gain };
    } catch {}
  }, [getAudioCtx]);

  const stopRoomTone = useCallback(() => {
    if (!roomToneRef.current) return;
    try {
      const ctx = getAudioCtx();
      if (ctx) {
        roomToneRef.current.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        roomToneRef.current.osc.stop(ctx.currentTime + 0.35);
      }
      roomToneRef.current = null;
    } catch {
      roomToneRef.current = null;
    }
  }, [getAudioCtx]);

  // Notification pings (Act 2: Digital Overload) — rising pitch, alternating stereo
  const playPing = useCallback(
    (freq: number) => {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch {}
    },
    [getAudioCtx]
  );

  // Sub-Bass Drop (Act 3: The Stop — 110Hz → 36Hz sine sweep)
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

  // Royal Cobalt Chime (Act 4: Brand Reveal — polyphonic 440/554/659/880/1318 Hz)
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

  /* ─── Utility ──────────────────────────────────────────────────────────── */

  const clearAllTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const endIntro = useCallback(() => {
    clearAllTimers();
    stopRoomTone();
    setIsPlaying(false);
    setIsComplete(true);
    setCurrentAct(0);
    setVisibleBadges([]);
    speedMultiplierRef.current = 0.45; // Calm fluid for live homepage background
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("stratxcel_intro_viewed", "true");
      } catch {}
    }
  }, [clearAllTimers, stopRoomTone]);

  /* ─── WebGL 60fps Liquid Cobalt Fluid Shader ───────────────────────────── */

  const initFluidShader = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl =
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      // 2D Canvas Fallback
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

    // Organic Watery Domain-Warping Fluid Shader
    // Palette: Obsidian → Midnight Navy → Royal Cobalt → Bright Sapphire
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

  // Window resize handler
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

  /* ─── Cinematic Timeline Orchestrator ──────────────────────────────────── */

  const playSequence = useCallback(() => {
    clearAllTimers();
    setIsPlaying(true);
    setIsComplete(false);
    setCurrentAct(0);
    setActiveShot(0);
    setVisibleBadges([]);
    setTextPhase(0);
    setExitPhase(0);
    speedMultiplierRef.current = 1.6;

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timeoutsRef.current.push(id);
      return id;
    };

    /* ─── ACT 1: REAL BUSINESS LIFE (00:00.0 – 00:02.0) ──────────────── */
    // 5 rapid micro-shots, 400ms each
    startRoomTone();

    schedule(() => {
      setCurrentAct(1);
      setActiveShot(0);
      playFoleyTap(280); // shutter latch
    }, 100);

    schedule(() => {
      setActiveShot(1);
      playFoleyTap(420); // espresso tamp
    }, 500);

    schedule(() => {
      setActiveShot(2);
      playFoleyTap(600); // scissor snip
    }, 900);

    schedule(() => {
      setActiveShot(3);
      playFoleyTap(340); // cloth fold
    }, 1300);

    schedule(() => {
      setActiveShot(4);
      playFoleyTap(500); // pen scratch
    }, 1700);

    /* ─── ACT 2: DIGITAL OVERLOAD (00:02.0 – 00:03.5) ────────────────── */
    const PING_FREQS = [660, 880, 1046, 1174, 1318];

    schedule(() => {
      setCurrentAct(2);
      setVisibleBadges([0]);
      playPing(PING_FREQS[0]);
    }, 2100);

    schedule(() => {
      setVisibleBadges([0, 1]);
      playPing(PING_FREQS[1]);
    }, 2400);

    schedule(() => {
      setVisibleBadges([0, 1, 2]);
      playPing(PING_FREQS[2]);
    }, 2700);

    schedule(() => {
      setVisibleBadges([0, 1, 2, 3]);
      playPing(PING_FREQS[3]);
    }, 2950);

    schedule(() => {
      setVisibleBadges([0, 1, 2, 3, 4]);
      playPing(PING_FREQS[4]);
    }, 3200);

    /* ─── ACT 3: THE STOP & THE INSIGHT (00:03.5 – 00:04.5) ──────────── */
    schedule(() => {
      setCurrentAct(3);
      setVisibleBadges([]); // All badges vanish
      stopRoomTone();
      // 0.3s dead silence before typography
    }, 3500);

    // Typography: "You need the work to get done." + Hindi subtitle
    schedule(() => {
      setTextPhase(3);
      playSubDrop(); // 110Hz → 36Hz sub-bass
    }, 3800);

    /* ─── ACT 4: STRATXCEL REVEAL (00:04.5 – 00:05.5) ────────────────── */
    schedule(() => {
      setExitPhase(3); // dissolve the insight text
    }, 4600);

    schedule(() => {
      setTextPhase(4); // brand reveal
      setCurrentAct(4);
      playCobaltChime(); // polyphonic chime
    }, 4900);

    /* ─── ACT 5: SEAMLESS HOMEPAGE TRANSITION (00:05.5 – 00:07.0) ─────── */
    schedule(() => {
      endIntro();
    }, 6800);
  }, [clearAllTimers, endIntro, playCobaltChime, playSubDrop, playPing, playFoleyTap, startRoomTone, stopRoomTone]);

  /* ─── Lifecycle Effects ────────────────────────────────────────────────── */

  // Mount: Initialize fluid shader + play if first visit
  useEffect(() => {
    initFluidShader();
    if (shouldPlayOnMount) {
      const timer = setTimeout(() => {
        playSequence();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [shouldPlayOnMount, initFluidShader, playSequence]);

  // Keyboard: ESC / Space to skip
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

  // Register global replay hook on window
  useEffect(() => {
    (window as unknown as { __replayStratxcelIntro?: () => void }).__replayStratxcelIntro = () => {
      playSequence();
    };
    return () => {
      delete (window as unknown as { __replayStratxcelIntro?: () => void }).__replayStratxcelIntro;
    };
  }, [playSequence]);

  /* ─── Render ───────────────────────────────────────────────────────────── */

  return (
    <>
      {/* SVG Defs: 3D Interlocking Dual-Orbital Stratxcel Emblem */}
      <svg style={{ display: "none" }} aria-hidden="true">
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

      {/* Watery Fluid Background Canvas (WebGL / 2D Fallback) */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          pointerEvents: "none",
          filter: "blur(26px) saturate(1.25) contrast(1.15)",
          transform: "scale(1.08)",
          transition: "filter 1.2s ease, opacity 1.2s ease",
        }}
      />

      {/* Film Grain Static Texture */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          opacity: 0.055,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Vignette Overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(2,4,8,0.05) 0%, rgba(2,4,8,0.7) 75%, rgba(1,2,5,0.95) 100%)",
        }}
      />

      {/* ═══ CINEMATIC INTRO STAGE ═══ */}
      {(!isComplete || isPlaying) && (
        <div
          role="dialog"
          aria-label="Stratxcel Brand Entrance"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2, 4, 8, 0.92)",
            color: "#FFFFFF",
            userSelect: "none",
            transition: "opacity 1s cubic-bezier(0.16, 1, 0.3, 1), visibility 1s ease",
            opacity: isPlaying ? 1 : 0,
            visibility: isPlaying ? "visible" : "hidden",
            pointerEvents: isPlaying ? "auto" : "none",
          }}
        >
          {/* Skip Intro Button */}
          <button
            type="button"
            onClick={endIntro}
            style={{
              position: "absolute",
              bottom: 32,
              right: 36,
              zIndex: 120,
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#94A3B8",
              fontFamily: "var(--font-sx-mono, 'JetBrains Mono', monospace)",
              fontSize: 11,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              padding: "8px 18px",
              borderRadius: 20,
              cursor: "pointer",
              backdropFilter: "blur(16px)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.3s ease",
            }}
          >
            <span>Skip Intro</span>
            <kbd
              style={{
                background: "rgba(255,255,255,0.1)",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 9,
                color: "#FFFFFF",
              }}
            >
              ESC
            </kbd>
          </button>

          {/* ─── ACT 1: Business Character Micro-Shots ──────────────────── */}
          {currentAct === 1 && (
            <div
              style={{
                position: "relative",
                width: "90vw",
                maxWidth: 920,
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              {BUSINESS_SHOTS.map((shot, i) => (
                <div
                  key={shot.name}
                  style={{
                    position: "absolute",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    opacity: activeShot === i ? 1 : 0,
                    transform: activeShot === i ? "scale(1) translateY(0)" : "scale(0.96) translateY(12px)",
                    filter: activeShot === i ? "blur(0px)" : "blur(10px)",
                    transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-sx-sans, 'Plus Jakarta Sans', sans-serif)",
                      fontSize: "clamp(20px, 3.2vw, 36px)",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      letterSpacing: "-0.3px",
                      textShadow: "0 8px 30px rgba(0,0,0,0.9), 0 0 20px rgba(0,71,255,0.25)",
                    }}
                  >
                    {shot.name}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sx-mono, monospace)",
                      fontSize: "clamp(10px, 1.4vw, 13px)",
                      fontWeight: 600,
                      color: "#93C5FD",
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                    }}
                  >
                    {shot.role}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sx-sans, sans-serif)",
                      fontSize: "clamp(13px, 1.6vw, 16px)",
                      fontWeight: 400,
                      color: "#94A3B8",
                      maxWidth: 520,
                      lineHeight: 1.5,
                      marginTop: 4,
                    }}
                  >
                    {shot.action}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ─── ACT 2: Digital Overload Notification Badges ─────────────── */}
          {currentAct === 2 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              {OVERLOAD_BADGES.map((badge, i) => {
                const isVisible = visibleBadges.includes(i);
                return (
                  <div
                    key={badge.text}
                    className={badge.position}
                    style={{
                      position: "absolute",
                      background: "rgba(15, 23, 42, 0.85)",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      borderRadius: 10,
                      padding: "10px 16px",
                      backdropFilter: "blur(12px)",
                      fontFamily: "var(--font-sx-sans, sans-serif)",
                      fontSize: "clamp(11px, 1.3vw, 14px)",
                      fontWeight: 600,
                      color: "#FCA5A5",
                      boxShadow: "0 4px 20px rgba(239, 68, 68, 0.3)",
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? "scale(1) translateY(0)" : "scale(0.85) translateY(10px)",
                      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#EF4444",
                        boxShadow: "0 0 8px #EF4444",
                        flexShrink: 0,
                      }}
                    />
                    {badge.text}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── ACT 3: The Stop & The Insight ──────────────────────────── */}
          {(currentAct === 3 || (currentAct === 4 && exitPhase === 3)) && (
            <div
              style={{
                position: "relative",
                width: "90vw",
                maxWidth: 920,
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  opacity: textPhase === 3 && exitPhase !== 3 ? 1 : 0,
                  transform:
                    textPhase === 3 && exitPhase !== 3
                      ? "scale(1) translateY(0)"
                      : exitPhase === 3
                      ? "scale(1.03) translateY(-14px)"
                      : "scale(0.96) translateY(14px)",
                  filter: textPhase === 3 && exitPhase !== 3 ? "blur(0px)" : "blur(12px)",
                  transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {/* Primary English */}
                <h2
                  style={{
                    fontFamily: "var(--font-sx-sans, 'Syne', sans-serif)",
                    fontSize: "clamp(28px, 4.5vw, 54px)",
                    fontWeight: 800,
                    color: "#FFFFFF",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.2,
                    textShadow: "0 10px 40px rgba(0,0,0,0.9), 0 0 30px rgba(0,71,255,0.45)",
                  }}
                >
                  You need the work{" "}
                  <span
                    style={{
                      color: "#93C5FD",
                      filter: "drop-shadow(0 0 28px rgba(0,71,255,0.85))",
                    }}
                  >
                    to get done.
                  </span>
                </h2>

                {/* Hindi Emotional Anchor */}
                <p
                  style={{
                    fontFamily: "var(--font-sx-sans, sans-serif)",
                    fontSize: "clamp(14px, 2vw, 22px)",
                    fontWeight: 500,
                    color: "rgba(147, 197, 253, 0.75)",
                    letterSpacing: "1px",
                    marginTop: 2,
                  }}
                >
                  आपको काम करवाना है
                </p>
              </div>
            </div>
          )}

          {/* ─── ACT 4: Stratxcel 3D Brand Reveal ───────────────────────── */}
          <div
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              opacity: textPhase === 4 ? 1 : 0,
              transform: textPhase === 4 ? "scale(1)" : "scale(0.9)",
              filter: textPhase === 4 ? "blur(0px)" : "blur(16px)",
              transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: 140,
                height: 140,
                position: "relative",
                marginBottom: 24,
                filter: "drop-shadow(0 15px 45px rgba(0,71,255,0.85))",
                animation: "subtleOrbit 6s ease-in-out infinite",
              }}
            >
              <svg viewBox="0 0 200 200" width="100%" height="100%">
                <use href="#stratxcel-emblem-vector" />
              </svg>
            </div>

            <h2
              style={{
                fontFamily: "var(--font-sx-sans, 'Syne', sans-serif)",
                fontSize: "clamp(28px, 4vw, 42px)",
                fontWeight: 800,
                letterSpacing: "7px",
                color: "#FFFFFF",
                textTransform: "uppercase",
                textShadow: "0 4px 24px rgba(0,71,255,0.5)",
              }}
            >
              STRATXCEL
            </h2>

            <p
              style={{
                fontFamily: "var(--font-sx-mono, monospace)",
                fontSize: "clamp(11px, 1.4vw, 15px)",
                fontWeight: 500,
                letterSpacing: "3.5px",
                textTransform: "uppercase",
                color: "#93C5FD",
                marginTop: 8,
              }}
            >
              Your AI Business Agent
            </p>
          </div>
        </div>
      )}

      {/* Keyframe for emblem orbital float */}
      <style>{`
        @keyframes subtleOrbit {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(2deg); }
        }
      `}</style>
    </>
  );
}
