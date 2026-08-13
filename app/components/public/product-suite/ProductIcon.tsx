import type { ProductDefinition } from "@/lib/product-suite/types";

const ICON_PATHS: Record<string, string> = {
  "business-growth-audit": "M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h14v2H4v-2z",
  "brand-brain": "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-7 14a7 7 0 0 1 14 0v1H5v-1z",
  "ai-research": "M10 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm8.5 14.5L19 17l-1.5 1.5L16 17l-1.5 1.5L13 17l-1.5 1.5L10 17l-1.5 1.5L7 17l-1.5 1.5L4 17",
  analytics: "M4 19h16v2H4v-2zm2-4h2v4H6v-4zm4-3h2v7h-2V8zm4-5h2v12h-2V3z",
  reporting: "M6 4h9l3 3v13H6V4zm2 2v11h10V8h-3V6H8zm2 2h6v2H10V6zm0 4h6v2h-6v-2z",
  "social-copilot": "M7 8h10v2H7V8zm0 4h7v2H7v-2zm-3-6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm14 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 18a4 4 0 0 1 8 0v1H5v-1zm10 0a4 4 0 0 1 4 4v1h-4v-1a4 4 0 0 1 0-4z",
  "seo-intelligence": "M10 2a6 6 0 0 0-4.9 9.5L2 18l4.5-3.1A6 6 0 1 0 10 2zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  "content-creation": "M5 4h14v2H5V4zm0 4h14v2H5V8zm0 4h10v2H5v-2zm0 4h8v2H5v-2z",
  "creative-studio": "M4 5h16v10H4V5zm2 2v6h12V7H6zm2 10h8v2H8v-2z",
  "video-reels": "M4 6h10v12H4V6zm12 3l6 3.5L16 14V9z",
  "ads-intelligence": "M4 4h16v4H4V4zm0 6h10v2H4v-2zm0 4h14v2H4v-2zm0 4h8v2H4v-2z",
  crm: "M8 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm-4 9a4 4 0 0 1 8 0v1H4v-1zm10 0a4 4 0 0 1 4 4v1h-4v-1a4 4 0 0 1 0-4z",
  "whatsapp-ai": "M12 3a8 8 0 0 0-6.9 12.1L3 21l5.9-1.9A8 8 0 1 0 12 3zm0 2a6 6 0 0 1 0 12 6 6 0 0 1 0-12zm-2.5 4.5h5v2h-5v-2z",
  website: "M4 5h16v2H4V5zm0 4h16v10H4V9zm2 2v6h12v-6H6z",
  automations: "M6 6h4v4H6V6zm8 0h4v4h-4V6zM6 14h4v4H6v-4zm8 0h4v4h-4v-4zm-2-2h2v2h-2v-2z",
  integrations: "M8 8h2v2H8V8zm6 0h2v2h-2V8zM6 10h2v2H6v-2zm10 0h2v2h-2v-2zM8 12h2v2H8v-2zm6 0h2v2h-2v-2z",
  "ai-workforce": "M12 3l2.4 4.8L16 8l-3.6 1.2L12 14l-0.4-2.8L8 8l1.6-.2L12 3zm-7 11a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm10 0a3 3 0 1 1 6 0 3 3 0 0 1-6 0z",
};

export function ProductIcon({ product, className = "" }: { product: ProductDefinition; className?: string }) {
  const path = ICON_PATHS[product.id] ?? ICON_PATHS["content-creation"];
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface-2 text-sx-accent ${className}`.trim()}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-current" role="img">
        <path d={path} />
      </svg>
    </span>
  );
}
