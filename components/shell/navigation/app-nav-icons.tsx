import { House, CheckCircle2, Image as ImageIcon, TrendingUp, Store, MessageCircle } from "lucide-react";

/**
 * Icons for the primary /app nav destinations.
 * Canonical IA: Home, Audit, Content, Growth, Brand.
 *
 * Master build brief sections 19-20 ("prefer appropriate use of...
 * Lucide"): replaced 6 hand-drawn Feather-style icons with the equivalent
 * real lucide-react icons (Lucide is itself a maintained fork of Feather,
 * so the visual language stays effectively identical) -- same 18px size,
 * strokeWidth 2, rounded caps/joins preserved.
 */
const ICON_SIZE = 18;
const ICON_STROKE = 2;

export function HouseIcon() {
  return <House size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

export function AuditCheckIcon() {
  return <CheckCircle2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

/** Content Library & Workspace Icon */
export function ContentIcon() {
  return <ImageIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

/** Growth Analytics & Outcomes Icon */
export function GrowthIcon() {
  return <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

/** Storefront / Brand Brain Icon */
export function StorefrontIcon() {
  return <Store size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}

/** Growth Assistant / Chat Icon (for secondary references) */
export function ChatDotsIcon() {
  return <MessageCircle size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
