import { createHash } from "node:crypto";
import type {
  CarouselArtifact,
  CarouselPage,
  CarouselPagePlan,
  CreativeBrief,
  CreativeConcept,
} from "../types.ts";
import { renderTypographyLayout } from "../typography/renderer.ts";

export function planCarouselPages(args: {
  brief: CreativeBrief;
  concept: CreativeConcept;
  pageCount?: number;
}): CarouselPagePlan[] {
  const pageCount = Math.max(3, args.pageCount ?? 5);
  const roles: CarouselPagePlan["role"][] = ["hook", "body", "body", "proof", "cta"];
  const plans: CarouselPagePlan[] = [];
  for (let i = 0; i < pageCount; i++) {
    const role = roles[Math.min(i, roles.length - 1)]!;
    plans.push({
      index: i,
      role: i === pageCount - 1 ? "cta" : role,
      headline:
        i === 0
          ? args.concept.hook.slice(0, 80)
          : i === pageCount - 1
            ? args.brief.cta
            : `${args.concept.title} · ${i + 1}`,
      body:
        i === 0
          ? args.brief.singleMindedObjective
          : i === pageCount - 1
            ? `Next step: ${args.brief.cta}`
            : `${args.concept.narrative} (${role} beat ${i + 1})`,
      visualIntent: `${args.concept.visualAngle} / page ${i + 1}`,
    });
  }
  return plans;
}

export function composeCarousel(args: {
  brief: CreativeBrief;
  plans: readonly CarouselPagePlan[];
  aspectRatio?: string;
  brandSystem?: string;
}): CarouselArtifact {
  const pages: CarouselPage[] = args.plans.map((plan) => {
    const layout = renderTypographyLayout({
      width: 1080,
      height: 1350,
      elements: [
        { kind: "text", content: plan.headline, x: 80, y: 160, fontSize: 64 },
        { kind: "text", content: plan.body, x: 80, y: 320, fontSize: 36 },
        { kind: "label", content: plan.role, x: 80, y: 80, fontSize: 20 },
      ],
    });
    const distinctKey = createHash("sha256")
      .update(`${plan.index}|${plan.role}|${plan.headline}|${plan.body}`)
      .digest("hex")
      .slice(0, 16);
    return {
      index: plan.index,
      role: plan.role,
      headline: plan.headline,
      body: plan.body,
      layoutFingerprint: layout.fingerprint,
      distinctKey,
    };
  });
  assertDistinctCarouselPages(pages);
  return {
    id: `carousel_${args.brief.id}_${pages.length}`,
    pages,
    aspectRatio: args.aspectRatio ?? "4:5",
    brandSystem: args.brandSystem ?? "default",
    qaPassed: qaCarouselPages(pages),
  };
}

export function qaCarouselPages(pages: readonly CarouselPage[]): boolean {
  try {
    assertDistinctCarouselPages(pages);
  } catch {
    return false;
  }
  if (pages.length < 2) return false;
  if (!pages.some((p) => p.role === "hook")) return false;
  if (!pages.some((p) => p.role === "cta")) return false;
  return pages.every((p) => p.headline.trim().length > 0 && p.body.trim().length > 0);
}

export function assertDistinctCarouselPages(pages: readonly CarouselPage[]): void {
  const keys = new Set(pages.map((p) => p.distinctKey));
  if (keys.size !== pages.length) throw new Error("carousel_pages_must_be_distinct");
  const fingerprints = new Set(pages.map((p) => p.layoutFingerprint));
  if (fingerprints.size !== pages.length) throw new Error("carousel_layouts_must_be_distinct");
}
