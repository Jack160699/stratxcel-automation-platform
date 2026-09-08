/**
 * Founder Computer — Hermes Browser/Computer Tool Definitions
 *
 * Generic browser and computer primitives that Hermes can invoke through
 * the connector authorization gate. These are intent descriptors — the actual
 * execution is dispatched to the browser runtime worker.
 */

export interface BrowserToolResult {
  success: boolean;
  jobId?: string;
  data?: Record<string, unknown>;
  screenshotRef?: string;
  text?: string;
  error?: string;
}

export interface BrowserNavigateParams {
  url: string;
  timeoutMs?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface BrowserClickParams {
  selector?: string;
  coordinates?: { x: number; y: number };
  button?: "left" | "right" | "middle";
  clickCount?: number;
}

export interface BrowserTypeParams {
  selector?: string;
  text: string;
  delayMs?: number;
  clearExisting?: boolean;
}

export interface BrowserScreenshotParams {
  fullPage?: boolean;
  selector?: string;
  quality?: number;
}

export interface BrowserReadParams {
  selector?: string;
  mode?: "text" | "html" | "table" | "structured";
  maxChars?: number;
}

export interface BrowserScrollParams {
  direction: "up" | "down" | "top" | "bottom";
  amount?: number;
}

export interface BrowserWaitParams {
  condition: "selector" | "navigation" | "timeout" | "network_idle";
  target?: string;
  timeoutMs?: number;
}

export interface BrowserUploadParams {
  selector: string;
  fileRef: string;
}

export interface BrowserDownloadParams {
  triggerSelector: string;
  destinationPath?: string;
}

export interface BrowserTabsParams {
  action: "new" | "close" | "switch" | "list";
  tabIndex?: number;
}

/**
 * Definition of all browser tools exposed to Hermes.
 * Each entry includes the capability key it maps to for authorization.
 */
export const FOUNDER_COMPUTER_TOOL_DEFINITIONS = [
  {
    name: "browser_navigate",
    capabilityKey: "browser.navigate",
    description: "Navigate the browser to a URL. Returns title and URL once loaded.",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    name: "browser_click",
    capabilityKey: "browser.click",
    description: "Click an element by selector or coordinate. Safe for links, buttons, tabs.",
    riskLevel: "medium",
    requiresApproval: false,
  },
  {
    name: "browser_type",
    capabilityKey: "browser.type",
    description: "Type text into an input field. NEVER used for passwords — only content/queries.",
    riskLevel: "medium",
    requiresApproval: false,
  },
  {
    name: "browser_screenshot",
    capabilityKey: "browser.screenshot",
    description: "Capture visual screenshot of current page or element. Returns storage reference.",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    name: "browser_read",
    capabilityKey: "browser.read",
    description: "Extract readable text or structured data from the active page.",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    name: "browser_scroll",
    capabilityKey: "browser.scroll",
    description: "Scroll the page up, down, to top, or to bottom.",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    name: "browser_wait",
    capabilityKey: "browser.wait",
    description: "Wait for an element, navigation, or network idle.",
    riskLevel: "low",
    requiresApproval: false,
  },
  {
    name: "browser_upload",
    capabilityKey: "browser.upload",
    description: "Upload a file to a file input element.",
    riskLevel: "high",
    requiresApproval: true,
  },
  {
    name: "browser_download",
    capabilityKey: "browser.download",
    description: "Trigger a file download and return storage reference.",
    riskLevel: "medium",
    requiresApproval: false,
  },
  {
    name: "browser_tabs",
    capabilityKey: "browser.tabs",
    description: "List, open, switch, or close browser tabs.",
    riskLevel: "low",
    requiresApproval: false,
  },
] as const;
