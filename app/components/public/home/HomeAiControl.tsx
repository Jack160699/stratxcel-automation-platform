import Link from "next/link";
import { PRODUCT_AVAILABILITY_LABELS, PRODUCTS, getProductHref } from "@/lib/product-suite/taxonomy";

/** What the AI actually does, in words a business owner already uses. */
const AI_WORK = [
  { verb: "Research", detail: "Look up competitors, categories, and what is changing around you." },
  { verb: "Draft", detail: "Write posts, replies, and page copy in your business's voice." },
  { verb: "Suggest", detail: "Point at what looks worth fixing, and why." },
  { verb: "Organise", detail: "Sort enquiries, attach owners, and keep threads from getting lost." },
  { verb: "Follow up", detail: "Prepare the next message so replying takes seconds, not an evening." },
  { verb: "Analyse", detail: "Summarise what happened across your channels in plain language." },
];

const TECHNICAL_PRODUCT_IDS = ["ai-workforce", "automations", "brand-brain", "ai-research"] as const;

export function HomeAiControl() {
  return (
    <section data-home-section="ai-control" id="ai" className="border-t border-sx-border bg-[#faf9f7]">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            AI that helps with the work — while you stay in control.
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
            Nothing gets published, sent, or spent because a machine decided to. The AI prepares the work and puts it in
            front of you. You approve it, change it, or throw it away.
          </p>
        </div>

        <ul className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {AI_WORK.map((item) => (
            <li key={item.verb} className="border-t border-sx-border pt-4">
              <p className="font-sx-sans text-[16px] font-semibold text-sx-text">{item.verb}</p>
              <p className="mt-1.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-sx-lg border border-sx-border bg-sx-bg p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-sx-sans text-[16px] font-semibold text-sx-text">If you want the technical names</p>
            <Link href="/products" className="font-sx-sans text-[13.5px] font-semibold text-sx-accent hover:underline">
              See all products →
            </Link>
          </div>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {TECHNICAL_PRODUCT_IDS.map((id) => {
              const product = PRODUCTS[id];
              if (!product) return null;
              return (
                <li key={id}>
                  <Link
                    href={getProductHref(product)}
                    className="block h-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors duration-200 hover:border-sx-border-strong motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-sx-sans text-[14.5px] font-semibold text-sx-text">{product.name}</p>
                      <span className="shrink-0 rounded-sx-pill border border-sx-border bg-sx-surface-2 px-2 py-0.5 font-sx-mono text-[9.5px] uppercase tracking-[0.1em] text-sx-text-subtle">
                        {PRODUCT_AVAILABILITY_LABELS[product.availability]}
                      </span>
                    </div>
                    <p className="mt-1.5 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                      {product.outcome}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 font-sx-sans text-[12.5px] leading-relaxed text-sx-text-subtle">
            Every product carries an honest availability label — live, in beta, run with our team, or not built yet.
          </p>
        </div>
      </div>
    </section>
  );
}
