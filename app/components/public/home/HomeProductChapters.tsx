import Link from "next/link";
import type { ReactNode } from "react";
import { getCustomerPresentation } from "@/lib/product-suite/customer-language";
import { PRODUCTS, getProductHref } from "@/lib/product-suite/taxonomy";
import {
  AnalyticsChapterVisual,
  CrmChapterVisual,
  SearchChapterVisual,
  SocialChapterVisual,
} from "./chapters/chapter-visuals";

type Chapter = {
  id: string;
  /** The customer outcome always leads; product names follow. */
  headline: string;
  body: string;
  productIds: readonly string[];
  href: string;
  ctaLabel: string;
  visual: ReactNode;
  /** Product interface sits on the left for alternating rhythm. */
  visualFirst?: boolean;
  surface: "warm" | "white";
};

const CHAPTERS: Chapter[] = [
  {
    id: "get-found",
    headline: "Get found when customers search for what you sell.",
    body: "Most people decide where to go before they ever speak to you. Stratxcel shows you what is missing across your listings, pages, and search presence, and what is worth fixing first.",
    productIds: ["seo-intelligence", "website"],
    href: getProductHref(PRODUCTS["seo-intelligence"]!),
    ctaLabel: "Get found on Google",
    visual: <SearchChapterVisual />,
    surface: "white",
  },
  {
    id: "stay-visible",
    headline: "Stay visible without spending your day creating content.",
    body: "Posts get planned, written in your business's voice, and put in front of you to approve. You keep the final say on everything that goes out.",
    productIds: ["social-copilot", "content-creation", "brand-brain"],
    href: "/social-autopilot",
    ctaLabel: "See how content gets made",
    visual: <SocialChapterVisual />,
    visualFirst: true,
    surface: "warm",
  },
  {
    id: "every-enquiry",
    headline: "Every enquiry in one place. Follow up before it goes cold.",
    body: "Messages from your website, WhatsApp, and social all land in the same inbox, with a reply prepared and an owner attached, so nothing quietly disappears.",
    productIds: ["crm", "whatsapp-ai", "automations"],
    href: getProductHref(PRODUCTS.crm!),
    ctaLabel: "See how enquiries are handled",
    visual: <CrmChapterVisual />,
    surface: "white",
  },
  {
    id: "what-is-working",
    headline: "See what's working. Know what deserves attention.",
    body: "One summary across your connected channels, written in plain language, pointing at the things that are worth a decision this week.",
    productIds: ["analytics", "reporting"],
    href: getProductHref(PRODUCTS.analytics!),
    ctaLabel: "See what you would know",
    visual: <AnalyticsChapterVisual />,
    visualFirst: true,
    surface: "warm",
  },
];

function ChapterCopy({ chapter }: { chapter: Chapter }) {
  return (
    <div className="lg:max-w-md">
      <h3 className="font-sx-sans text-[clamp(1.4rem,2.4vw+0.5rem,2.05rem)] font-semibold leading-[1.18] tracking-[-0.03em] text-sx-text">
        {chapter.headline}
      </h3>
      <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">{chapter.body}</p>

      <ul className="mt-7 space-y-3 border-t border-sx-border pt-6">
        {chapter.productIds.map((id) => {
          const product = PRODUCTS[id];
          if (!product) return null;
          const presentation = getCustomerPresentation(id);
          return (
            <li key={id}>
              <p className="font-sx-sans text-[14.5px] font-medium text-sx-text">
                {presentation?.headline ?? product.outcome}
              </p>
              <p className="mt-0.5 font-sx-mono text-[10.5px] uppercase tracking-[0.16em] text-sx-text-subtle">
                {product.name}
              </p>
            </li>
          );
        })}
      </ul>

      <Link
        href={chapter.href}
        className="mt-7 inline-flex items-center gap-1.5 font-sx-sans text-[14.5px] font-semibold text-sx-accent hover:underline"
      >
        {chapter.ctaLabel} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

export function HomeProductChapters() {
  return (
    <div data-home-section="product-chapters" id="products">
      {CHAPTERS.map((chapter) => (
        <section
          key={chapter.id}
          id={chapter.id}
          className={`border-t border-sx-border ${chapter.surface === "warm" ? "bg-[#faf9f7]" : "bg-sx-surface-1"}`}
        >
          <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,9vw,6.5rem)] sm:px-6 lg:px-8">
            {/* The wide track always holds the product interface, on either side. */}
            <div
              className={`grid items-center gap-10 lg:gap-16 ${
                chapter.visualFirst
                  ? "lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]"
                  : "lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
              }`}
            >
              <div className={chapter.visualFirst ? "lg:order-2" : ""}>
                <ChapterCopy chapter={chapter} />
              </div>
              <div className={chapter.visualFirst ? "lg:order-1" : ""}>{chapter.visual}</div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
