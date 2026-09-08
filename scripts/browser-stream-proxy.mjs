import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.STREAM_PORT || 6080);
const VNC_PORT = Number(process.env.VNC_PORT || 5900);
const CDP_PORT = Number(process.env.CDP_PORT || 9222);

// Secret derivation for HMAC token validation
const masterKey =
  process.env.FOUNDER_VIEWER_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "stratxcel-local-dev-fallback-secret-key-32ch";

const STREAM_SECRET = crypto
  .createHmac("sha256", masterKey)
  .update("stratxcel-founder-viewer-v1")
  .digest("hex");

let activeViewers = 0;
let currentLock = "AVAILABLE"; // "AVAILABLE" | "FOUNDER_CONTROL" | "HERMES_CONTROL"

/**
 * Validates the HMAC-signed viewer token.
 */
function verifyToken(token) {
  if (!token || typeof token !== "string") return { ok: false, error: "Missing token" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "Malformed token" };

  const [payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", STREAM_SECRET)
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: "Invalid signature" };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { ok: false, error: "Token expired" };
    }
    if (payload.scope !== "founder_browser_view") {
      return { ok: false, error: "Invalid scope" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid payload JSON" };
  }
}

/**
 * Queries CDP for active pages.
 */
async function getActivePages() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, { timeout: 1500 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const list = JSON.parse(data);
          resolve(Array.isArray(list) ? list.filter((p) => p.type === "page") : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers for admin API calls
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health" || url.pathname.endsWith("/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        activeViewers,
        lock: currentLock,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (url.pathname === "/current-page" || url.pathname.endsWith("/current-page")) {
    const pages = await getActivePages();
    const primary = pages[0] || null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        url: primary?.url || "about:blank",
        title: primary?.title || "",
        id: primary?.id || null,
        totalPages: pages.length,
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// WebSocket Server (noServer mode to authenticate in HTTP upgrade)
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";

  // Authenticate token
  const auth = verifyToken(token);
  if (!auth.ok) {
    console.warn(`[browser-stream-proxy] Rejected unauthorized upgrade: ${auth.error}`);
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  // Handle WebSocket upgrade
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, auth.payload);
  });
});

wss.on("connection", (ws, req, payload) => {
  activeViewers++;
  currentLock = "FOUNDER_CONTROL";
  console.log(
    `[browser-stream-proxy] Viewer connected: ${payload?.email || payload?.userId || "admin"} (activeViewers=${activeViewers})`
  );

  // Connect to local x11vnc on 127.0.0.1:5900
  const vncSocket = net.createConnection(VNC_PORT, "127.0.0.1");

  vncSocket.on("connect", () => {
    console.log("[browser-stream-proxy] Connected to x11vnc :5900");
  });

  // VNC -> WebSocket
  vncSocket.on("data", (chunk) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk, { binary: true });
    }
  });

  // WebSocket -> VNC
  ws.on("message", (msg) => {
    if (vncSocket.writable) {
      vncSocket.write(msg);
    }
  });

  // Handle teardown
  const cleanup = () => {
    vncSocket.destroy();
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };

  ws.on("close", () => {
    vncSocket.destroy();
    activeViewers = Math.max(0, activeViewers - 1);
    if (activeViewers === 0) {
      currentLock = "AVAILABLE";
    }
    console.log(
      `[browser-stream-proxy] Viewer disconnected (activeViewers=${activeViewers}, lock=${currentLock})`
    );
  });

  ws.on("error", (err) => {
    console.error("[browser-stream-proxy] WebSocket error:", err.message);
    cleanup();
  });

  vncSocket.on("close", () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  vncSocket.on("error", (err) => {
    console.error("[browser-stream-proxy] VNC socket error:", err.message);
    cleanup();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[browser-stream-proxy] Authenticated proxy listening on 127.0.0.1:${PORT}`);
  console.log(`[browser-stream-proxy] Bridging to x11vnc on 127.0.0.1:${VNC_PORT}`);
});
