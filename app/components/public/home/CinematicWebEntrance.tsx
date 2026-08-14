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
  const [isComplete, setIsComplete] = useState<boolean>(true);
  const [currentAct, setCurrentAct] = useState<number>(0);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [spawnedPings, setSpawnedPings] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; radius: number; alpha: number; color: string }>
  >([]);
  const isConvergingRef = useRef<boolean>(false);

  // Initialize Web Audio safely
  const getAudioCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const playPing = useCallback((freq = 880, type: OscillatorType = "sine") => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }, [getAudioCtx]);

  const playSubDrop = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(95, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.9);

      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.1);
    } catch {}
  }, [getAudioCtx]);

  const playCobaltChime = useCallback(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const frequencies = [523.25, 659.25, 783.99, 1046.5, 1567.98];
      frequencies.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.04);

        gain.gain.setValueAtTime(0.035, ctx.currentTime + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.04 + 1.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.04);
        osc.stop(ctx.currentTime + i * 0.04 + 1.6);
      });
    } catch {}
  }, [getAudioCtx]);

  const clearAllTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const endIntro = useCallback(() => {
    clearAllTimers();
    setIsPlaying(false);
    setIsComplete(true);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("stratxcel_intro_viewed", "true");
      } catch {}
    }
  }, [clearAllTimers]);

  const startParticleEngine = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particlesRef.current = [];
    for (let i = 0; i < 70; i++) {
      particlesRef.current.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.6 + 0.2,
        color: "#0055FF",
      });
    }

    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      particlesRef.current.forEach((p) => {
        if (isConvergingRef.current) {
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          p.vx += dx * 0.003;
          p.vy += dy * 0.003;
          p.vx *= 0.94;
          p.vy *= 0.94;
        }

        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }, []);

  const playSequence = useCallback(() => {
    clearAllTimers();
    setIsPlaying(true);
    setIsComplete(false);
    setCurrentAct(1);
    setActiveShot(0);
    setSpawnedPings([]);
    isConvergingRef.current = false;

    startParticleEngine();

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timeoutsRef.current.push(id);
      return id;
    };

    // ACT 1: REAL BUSINESSES (00:00 - 00:02)
    schedule(() => {
      setActiveShot(1);
      playPing(520);
    }, 400);

    schedule(() => {
      setActiveShot(2);
      playPing(640);
    }, 800);

    schedule(() => {
      setActiveShot(3);
      playPing(760);
    }, 1200);

    schedule(() => {
      setActiveShot(4);
      playPing(880);
    }, 1600);

    // ACT 2: DIGITAL OVERLOAD (00:02 - 00:03.5)
    schedule(() => {
      setCurrentAct(2);
      [0, 1, 2, 3, 4].forEach((idx) => {
        schedule(() => {
          setSpawnedPings((prev) => [...prev, idx]);
          playPing(1000 + idx * 180, "triangle");
        }, idx * 240);
      });
    }, 2000);

    // ACT 3: THE STOP (00:03.5 - 00:04.5)
    schedule(() => {
      setCurrentAct(3);
      playSubDrop();
    }, 3500);

    // ACT 4: STRATXCEL REVEAL (00:04.5 - 00:05.5)
    schedule(() => {
      setCurrentAct(4);
      isConvergingRef.current = true;
      playCobaltChime();
    }, 4500);

    // ACT 5: TRANSITION TO LIVE HOMEPAGE (00:05.5 - 00:06.5)
    schedule(() => {
      endIntro();
    }, 6300);
  }, [clearAllTimers, endIntro, playCobaltChime, playPing, playSubDrop, startParticleEngine]);

  // Initial trigger if not seen in session
  useEffect(() => {
    if (!shouldPlayOnMount) return;
    const timer = setTimeout(() => {
      playSequence();
    }, 20);
    return () => clearTimeout(timer);
  }, [shouldPlayOnMount, playSequence]);

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

  if (isComplete && !isPlaying) {
    return null;
  }

  const PING_ITEMS = [
    { text: "42 Unanswered Customer DMs", color: "red", pos: "top-[20%] left-[8%] sm:left-[14%]" },
    { text: "Slot Double-Booked: 11:30 AM", color: "amber", pos: "top-[34%] right-[8%] sm:right-[16%]" },
    { text: "Ad Campaign Stalled (Low ROAS)", color: "blue", pos: "top-[50%] left-[10%] sm:left-[20%]" },
    { text: "5 Pending Follow-Up Invoices", color: "red", pos: "top-[66%] right-[10%] sm:right-[22%]" },
    { text: "Social Post & Review Overdue", color: "green", pos: "top-[80%] left-[12%] sm:left-[35%]" },
  ];

  return (
    <div
      role="dialog"
      aria-label="Stratxcel Brand Entrance"
      aria-modal="true"
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#030509] text-white transition-opacity duration-700 select-none ${
        isPlaying ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Particle Canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Skip Button */}
      <button
        type="button"
        onClick={endIntro}
        className="absolute bottom-7 right-8 z-[100] flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-sx-mono text-[11px] font-semibold tracking-wider text-slate-300 uppercase backdrop-blur-md transition-all hover:border-blue-500 hover:bg-blue-600/20 hover:text-white"
      >
        <span>Skip Intro</span>
        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white">ESC</kbd>
      </button>

      {/* ACT 1: REAL BUSINESSES (00:00 - 00:02) */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
          currentAct === 1 ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="relative h-[60vh] max-h-[620px] w-[88vw] max-w-[1080px] overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
          {/* Shot 1: Gym Owner */}
          <div
            className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-12 transition-all duration-400 bg-gradient-to-t from-[#030509] via-[#0d1117]/80 to-[#181e29] ${
              activeShot === 0 ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
            }`}
          >
            <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-blue-300">
              06:00 AM • Iron Gym Studio, Pune
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Morning prep & opening doors
            </h2>
            <p className="mt-1 font-sx-sans text-sm text-slate-400">
              Equipment checked. Training schedules aligned.
            </p>
          </div>

          {/* Shot 2: Artisan Cafe */}
          <div
            className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-12 transition-all duration-400 bg-gradient-to-t from-[#050403] via-[#0f0a07]/80 to-[#241a14] ${
              activeShot === 1 ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
            }`}
          >
            <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-amber-300">
              07:15 AM • Specialty Roastery, Bengaluru
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Crafting the first brew
            </h2>
            <p className="mt-1 font-sx-sans text-sm text-slate-400">
              Fresh beans ground. Tables prepped for morning rush.
            </p>
          </div>

          {/* Shot 3: Salon & Spa */}
          <div
            className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-12 transition-all duration-400 bg-gradient-to-t from-[#060408] via-[#0e0914]/80 to-[#20172b] ${
              activeShot === 2 ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
            }`}
          >
            <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-purple-300">
              08:30 AM • Artisan Salon, Mumbai
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Setting the station
            </h2>
            <p className="mt-1 font-sx-sans text-sm text-slate-400">
              Tools sterilized. Appointments queued for the day.
            </p>
          </div>

          {/* Shot 4: Boutique Merchant */}
          <div
            className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-12 transition-all duration-400 bg-gradient-to-t from-[#080603] via-[#100c06]/80 to-[#261f12] ${
              activeShot === 3 ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
            }`}
          >
            <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-yellow-300">
              09:15 AM • Heritage Retail, Jaipur
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Curating real inventory
            </h2>
            <p className="mt-1 font-sx-sans text-sm text-slate-400">
              Shelves organized. Customers arriving at the door.
            </p>
          </div>

          {/* Shot 5: Independent Entrepreneur */}
          <div
            className={`absolute inset-0 flex flex-col justify-end p-8 sm:p-12 transition-all duration-400 bg-gradient-to-t from-[#03050a] via-[#080d17]/80 to-[#101b2e] ${
              activeShot === 4 ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
            }`}
          >
            <span className="font-sx-mono text-xs font-bold uppercase tracking-widest text-sky-300">
              10:00 AM • Strategic Operations, Raipur
            </span>
            <h2 className="mt-2 font-sx-sans text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Building the business vision
            </h2>
            <p className="mt-1 font-sx-sans text-sm text-slate-400">
              Focusing on growth, client satisfaction, and real work.
            </p>
          </div>
        </div>
      </div>

      {/* ACT 2: DIGITAL OVERLOAD PINGS (00:02 - 00:03.5) */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          currentAct === 2 ? "opacity-100" : "opacity-0"
        }`}
      >
        {PING_ITEMS.map((item, idx) => {
          const isSpawned = spawnedPings.includes(idx);
          return (
            <div
              key={item.text}
              className={`absolute flex items-center gap-3 rounded-xl border border-white/15 bg-slate-900/90 px-4 py-3 text-xs sm:text-sm font-semibold text-white shadow-2xl backdrop-blur-xl transition-all duration-300 ${
                item.pos
              } ${isSpawned ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-75 translate-y-3"}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  item.color === "red"
                    ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                    : item.color === "amber"
                    ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                    : item.color === "blue"
                    ? "bg-blue-500 shadow-[0_0_8px_#3b82f6]"
                    : "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                }`}
              />
              <span>{item.text}</span>
            </div>
          );
        })}
      </div>

      {/* ACT 3: THE STOP (00:03.5 - 00:04.5) */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-6 text-center transition-all duration-400 ${
          currentAct === 3 ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <h1 className="max-w-3xl font-sx-sans text-3xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
          &ldquo;You need the work to get done.&rdquo;
        </h1>
      </div>

      {/* ACT 4: STRATXCEL REVEAL (00:04.5 - 00:05.5) */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-6 text-center transition-all duration-500 ${
          currentAct === 4 ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {/* 3D Interlocking Dual-Orbital Emblem */}
        <div className="relative mb-6 h-32 w-32 filter drop-shadow-[0_15px_35px_rgba(0,71,255,0.7)] animate-bounce-subtle">
          <svg viewBox="0 0 200 200" width="100%" height="100%">
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
            </defs>

            {/* Back Loop */}
            <path
              d="M 30,120 C 15,70 45,20 100,20 C 155,20 185,70 170,120 C 155,170 125,180 100,180 C 75,180 45,170 30,120 Z"
              fill="none"
              stroke="url(#stratxcel-blue-outer)"
              strokeWidth="22"
              strokeLinecap="round"
              transform="rotate(-28 100 100)"
            />
            <path
              d="M 36,115 C 22,72 48,26 98,24 C 148,22 176,68 164,115"
              fill="none"
              stroke="url(#stratxcel-bevel-light)"
              strokeWidth="5"
              transform="rotate(-28 100 100)"
            />

            {/* Fore Loop */}
            <path
              d="M 30,120 C 15,70 45,20 100,20 C 155,20 185,70 170,120 C 155,170 125,180 100,180 C 75,180 45,170 30,120 Z"
              fill="none"
              stroke="url(#stratxcel-blue-outer)"
              strokeWidth="22"
              strokeLinecap="round"
              transform="rotate(38 100 100)"
            />
            <path
              d="M 36,115 C 22,72 48,26 98,24 C 148,22 176,68 164,115"
              fill="none"
              stroke="url(#stratxcel-bevel-light)"
              strokeWidth="5"
              transform="rotate(38 100 100)"
            />

            {/* Cross Bridge */}
            <path
              d="M 78,56 C 88,48 112,48 122,56 C 132,64 125,84 100,98 C 75,112 68,132 78,144"
              fill="none"
              stroke="url(#stratxcel-inner-glow)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 className="font-sx-sans text-3xl sm:text-5xl font-extrabold tracking-[0.2em] text-white uppercase">
          STRATXCEL
        </h2>
        <p className="mt-2 font-sx-mono text-xs sm:text-sm font-semibold tracking-[0.24em] text-blue-300 uppercase">
          Your AI Business Agent
        </p>
      </div>
    </div>
  );
}
