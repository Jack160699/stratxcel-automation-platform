import { createHash } from "node:crypto";
import type { TypographyLayout } from "../types.ts";

export function renderTypographyLayout(args: {
  id?: string;
  width: number;
  height: number;
  elements: TypographyLayout["elements"];
}): TypographyLayout {
  const normalized = args.elements.map((el) => ({
    kind: el.kind,
    content: el.content,
    x: Math.round(el.x),
    y: Math.round(el.y),
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
  }));
  const payload = JSON.stringify({ width: args.width, height: args.height, elements: normalized });
  const fingerprint = createHash("sha256").update(payload).digest("hex");
  return {
    id: args.id ?? `typo_${fingerprint.slice(0, 12)}`,
    width: args.width,
    height: args.height,
    elements: normalized,
    fingerprint,
  };
}
