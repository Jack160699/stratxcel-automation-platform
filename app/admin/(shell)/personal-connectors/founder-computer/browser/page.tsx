"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { platformFetch } from "@/lib/admin/platform-fetch";

export default function FounderBrowserViewerPage() {
  const router = useRouter();
  const screenRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const rfbRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("--:--");

  const [urlInput, setUrlInput] = useState("https://accounts.google.com");
  const [currentPage, setCurrentPage] = useState<{ url: string; title: string } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    ok: boolean;
    message: string;
    domains: string[];
    capabilities: string[];
  } | null>(null);

  // Clean exit: clear clipboard, release lock and redirect
  const handleExit = useCallback(async () => {
    try {
      if (rfbRef.current) {
        // Clear remote clipboard so sensitive passwords/tokens never linger
        rfbRef.current.clipboardPasteFrom("");
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      await platformFetch("/api/admin/personal-connectors/founder-computer/close-viewer", {
        method: "POST",
      });
    } catch {}
    router.push("/admin/personal-connectors");
  }, [router]);

  // Request viewer authorization token
  const requestViewerToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/viewer-token", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to authorize browser viewer session");
      }
      setToken(data.token);
      setStreamUrl(data.streamUrl);
      setExpiresAt(data.expiresAt);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to obtain viewer session");
      setLoading(false);
      return null;
    }
  }, []);

  // Initialize RFB client once streamUrl and container are ready
  const initRFB = useCallback(async (url: string) => {
    if (!screenRef.current) return;
    try {
      // Disconnect existing if any
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }

      // Dynamic import of @novnc/novnc
      const RFBModule = await import("@novnc/novnc");
      const RFB = RFBModule.default;

      screenRef.current.innerHTML = "";
      const rfb = new RFB(screenRef.current, url, {
        shared: true,
        credentials: {},
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.focusOnClick = true;
      rfb.clipViewport = false;

      rfb.addEventListener("connect", () => {
        setConnected(true);
        setLoading(false);
        setError(null);
        // Automatically give real keyboard focus to remote desktop canvas
        setTimeout(() => {
          rfb.focus({ preventScroll: true });
        }, 50);
      });

      rfb.addEventListener("disconnect", (e: any) => {
        setConnected(false);
        if (e.detail?.clean) {
          setError("Remote browser viewer session ended.");
        } else {
          setError("Disconnected from remote browser stream. Click Reconnect to retry.");
        }
      });

      rfb.addEventListener("securityfailure", (e: any) => {
        setConnected(false);
        setError(`Security failure: ${e.detail?.reason || "Authentication rejected"}`);
      });

      // Synchronize remote copy to local clipboard if user copies text inside remote Chrome
      rfb.addEventListener("clipboard", (e: any) => {
        if (e.detail?.text && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(e.detail.text).catch(() => {});
        }
      });

      rfbRef.current = rfb;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize remote viewer client");
      setLoading(false);
    }
  }, []);

  // Start viewer on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await requestViewerToken();
      if (mounted && session?.streamUrl) {
        await initRFB(session.streamUrl);
      }
    })();

    return () => {
      mounted = false;
      if (rfbRef.current) {
        try {
          rfbRef.current.clipboardPasteFrom("");
          rfbRef.current.disconnect();
        } catch {}
        rfbRef.current = null;
      }
      // Release lock on unmount
      platformFetch("/api/admin/personal-connectors/founder-computer/close-viewer", {
        method: "POST",
      }).catch(() => {});
    };
  }, [requestViewerToken, initRFB]);

  // Seamless Native Paste: Intercept Ctrl+V or right-click paste and route directly to RFB
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If user is typing in the address bar input, allow normal address bar paste
      if (document.activeElement === urlInputRef.current) return;

      const text = e.clipboardData?.getData("text/plain");
      if (text && rfbRef.current) {
        e.preventDefault();

        // 1. Send text directly to remote X11 CUT_BUFFER0 & CLIPBOARD via RFB ClientCutText
        rfbRef.current.clipboardPasteFrom(text);

        // 2. Dispatch Ctrl+V keystroke into focused remote Chrome element
        // XK_Control_L = 0xffe3, XK_v = 0x76
        setTimeout(() => {
          if (rfbRef.current) {
            rfbRef.current.sendKey(0xffe3, "ControlLeft", true);
            rfbRef.current.sendKey(0x76, "KeyV", true);
            setTimeout(() => {
              if (rfbRef.current) {
                rfbRef.current.sendKey(0x76, "KeyV", false);
                rfbRef.current.sendKey(0xffe3, "ControlLeft", false);
              }
            }, 30);
          }
        }, 40);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Prevent local browser navigation/tab hijacking on shortcuts when canvas is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === urlInputRef.current) return;

      // Prevent local browser from tabbing away or backspacing out of the viewer page
      if (e.key === "Tab") {
        e.preventDefault();
        if (rfbRef.current) {
          rfbRef.current.focus({ preventScroll: true });
          rfbRef.current.sendKey(0xff09, "Tab", true);
          setTimeout(() => {
            if (rfbRef.current) rfbRef.current.sendKey(0xff09, "Tab", false);
          }, 30);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  // Expiration countdown
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const remainingMs = new Date(expiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        setTimeRemaining("EXPIRED");
        setError("Viewer token expired. Please refresh to start a new session.");
        clearInterval(interval);
      } else {
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        setTimeRemaining(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Navigate remote browser
  const handleNavigate = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setIsNavigating(true);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "browser.navigate",
          payload: { url: targetUrl },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Navigation failed");
      setUrlInput(data.url || targetUrl);
      setCurrentPage({ url: data.url || targetUrl, title: data.title || "" });
      // Re-focus canvas after navigation
      setTimeout(() => {
        if (rfbRef.current) rfbRef.current.focus({ preventScroll: true });
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to navigate");
    } finally {
      setIsNavigating(false);
    }
  };

  // Keyboard navigation helpers (Back, Forward, Refresh)
  const handleKeyAction = async (key: string) => {
    try {
      await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "browser.key",
          payload: { key },
        }),
      });
      setTimeout(() => {
        if (rfbRef.current) rfbRef.current.focus({ preventScroll: true });
      }, 150);
    } catch {}
  };

  // Take full screenshot of active remote browser
  const handleScreenshot = async () => {
    setIsTakingScreenshot(true);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "browser.screenshot",
          payload: { fullPage: false },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Screenshot failed");
      if (data.dataUrl || data.bufferBase64) {
        setScreenshotPreview(data.dataUrl || `data:image/png;base64,${data.bufferBase64}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture screenshot");
    } finally {
      setIsTakingScreenshot(false);
    }
  };

  // Verify active session
  const handleVerifySession = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceGoogleAuth: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification check failed");

      setVerificationResult({
        ok: data.status === "ready",
        message: data.message,
        domains: data.authenticatedDomains || [],
        capabilities: data.discoveredCapabilities || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify session");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0b0f17] text-white overflow-hidden font-sans">
      {/* Top Navigation Toolbar */}
      <header className="flex h-14 items-center justify-between border-b border-white/10 bg-[#121824] px-4 shrink-0 gap-3">
        {/* Left: Back & Lock Status */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 transition"
          >
            ← Exit & Release Control
          </button>

          <div className="flex items-center gap-2 border-l border-white/10 pl-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-mono font-medium ${
                connected
                  ? "bg-[#5BDCA7]/10 text-[#5BDCA7] border border-[#5BDCA7]/30"
                  : "bg-[#FF8A90]/10 text-[#FF8A90] border border-[#FF8A90]/30"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-[#5BDCA7] animate-pulse" : "bg-[#FF8A90]"
                }`}
              />
              {connected ? "LIVE (Founder Control)" : loading ? "CONNECTING..." : "DISCONNECTED"}
            </span>

            <span className="text-[11px] font-mono text-white/50">
              ⏱️ {timeRemaining}
            </span>
          </div>
        </div>

        {/* Center: Address Bar & Navigation */}
        <div className="flex flex-1 max-w-2xl items-center gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleKeyAction("Alt+Left")}
              title="Back"
              className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => handleKeyAction("Alt+Right")}
              title="Forward"
              className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => handleKeyAction("F5")}
              title="Reload"
              className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              🔄
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleNavigate(urlInput);
            }}
            className="flex flex-1 items-center gap-1"
          >
            <input
              ref={urlInputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="h-8 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 font-mono text-xs text-white placeholder-white/30 focus:border-[#5BDCA7] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isNavigating}
              className="h-8 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-50 transition"
            >
              {isNavigating ? "Going..." : "Go"}
            </button>
          </form>
        </div>

        {/* Right: Quick Launch & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border-r border-white/10 pr-2">
            <button
              type="button"
              onClick={() => {
                setUrlInput("https://accounts.google.com");
                void handleNavigate("https://accounts.google.com");
              }}
              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/15 transition"
            >
              Google Login
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput("https://gemini.google.com");
                void handleNavigate("https://gemini.google.com");
              }}
              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/15 transition"
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput("https://claude.ai");
                void handleNavigate("https://claude.ai");
              }}
              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/15 transition"
            >
              Claude
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput("https://example.com");
                void handleNavigate("https://example.com");
              }}
              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/15 transition"
            >
              example.com
            </button>
          </div>

          <button
            type="button"
            onClick={handleScreenshot}
            disabled={isTakingScreenshot}
            title="Capture Screenshot"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15 transition"
          >
            {isTakingScreenshot ? "📸..." : "📸 Screenshot"}
          </button>

          <button
            type="button"
            onClick={handleVerifySession}
            disabled={isVerifying}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5BDCA7] px-3 py-1.5 text-xs font-semibold text-black shadow hover:opacity-90 disabled:opacity-50 transition"
          >
            {isVerifying ? "Verifying..." : "✓ Verify Session"}
          </button>
        </div>
      </header>

      {/* Notification / Status Banners */}
      {error && (
        <div className="flex items-center justify-between bg-[#FF8A90]/20 border-b border-[#FF8A90]/30 px-4 py-2 text-xs text-[#FF8A90]">
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => {
              void requestViewerToken().then((sess) => {
                if (sess?.streamUrl) void initRFB(sess.streamUrl);
              });
            }}
            className="rounded bg-[#FF8A90]/30 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#FF8A90]/40"
          >
            Reconnect
          </button>
        </div>
      )}

      {verificationResult && (
        <div
          className={`flex items-center justify-between border-b px-4 py-2 text-xs ${
            verificationResult.ok
              ? "bg-[#5BDCA7]/15 border-[#5BDCA7]/30 text-[#5BDCA7]"
              : "bg-amber-500/15 border-amber-500/30 text-amber-300"
          }`}
        >
          <div>
            <span className="font-semibold">{verificationResult.ok ? "✓ Session Ready: " : "⚠️ Notice: "}</span>
            {verificationResult.message}
            {verificationResult.domains.length > 0 && (
              <span className="ml-2 font-mono text-[11px]">
                Domains: [{verificationResult.domains.join(", ")}]
              </span>
            )}
            {verificationResult.capabilities.length > 0 && (
              <span className="ml-2 text-[11px] opacity-80">
                ({verificationResult.capabilities.length} capabilities active)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setVerificationResult(null)}
            className="text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Canvas Viewport */}
      <main
        onClick={() => {
          if (rfbRef.current) {
            rfbRef.current.focus({ preventScroll: true });
          }
        }}
        className="relative flex flex-1 items-center justify-center bg-[#070a0f] p-2 overflow-auto cursor-default"
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0f17]/90 z-10 space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#5BDCA7]" />
            <p className="font-mono text-xs text-white/70">Connecting to Founder Browser stream on EC2...</p>
          </div>
        )}

        {/* noVNC Canvas Target */}
        <div
          ref={screenRef}
          className="relative flex items-center justify-center rounded-lg shadow-2xl border border-white/10 overflow-hidden bg-black"
          style={{ width: "1280px", height: "800px", maxWidth: "100%", maxHeight: "100%" }}
        />
      </main>

      {/* Screenshot Preview Modal */}
      {screenshotPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="flex max-h-[90vh] max-w-4xl flex-col rounded-xl border border-white/15 bg-[#121824] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-semibold text-xs text-white">📸 Remote Browser View Screenshot</span>
              <button
                type="button"
                onClick={() => setScreenshotPreview(null)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotPreview}
                alt="Founder Browser Screenshot"
                className="max-h-[70vh] rounded-lg border border-white/10 object-contain mx-auto"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 bg-black/20 px-4 py-2.5">
              <a
                href={screenshotPreview}
                download="founder-browser-view.png"
                className="rounded-lg bg-[#5BDCA7] px-3 py-1 text-xs font-semibold text-black hover:opacity-90 transition"
              >
                Download PNG
              </a>
              <button
                type="button"
                onClick={() => setScreenshotPreview(null)}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Security Badge */}
      <footer className="flex h-8 items-center justify-between border-t border-white/10 bg-[#121824] px-4 text-[11px] text-white/50 shrink-0">
        <div className="flex items-center gap-3">
          <span>🔒 Direct Hardware Desktop Input: Normal typing, Caps Lock, Shift, Tab, Enter, and Ctrl+V paste.</span>
          <span>•</span>
          <span>Zero-Knowledge: Passwords flow directly to remote Chrome. No keystroke or clipboard logging.</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span>Hermes Lock: {connected ? "PAUSED (Founder Control Active)" : "AVAILABLE"}</span>
        </div>
      </footer>
    </div>
  );
}
