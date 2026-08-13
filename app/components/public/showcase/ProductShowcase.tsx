"use client";

import { useCallback, useState, type ComponentType, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { DemoBrowserFrame } from "./DemoBrowserFrame";
import { FeatureSpotlight } from "./FeatureSpotlight";
import { WorkflowDemo } from "./WorkflowDemo";
import { ScrollReveal } from "@/app/components/public/motion/ScrollReveal";
import { SHOWCASE_TABS, type ShowcaseTabId } from "./fixtures/showcase-data";

const DashboardDemo = dynamic(() => import("./demos/DashboardDemo").then((m) => m.DashboardDemo), { loading: () => <DemoSkeleton /> });
const BrandBrainDemo = dynamic(() => import("./demos/BrandBrainDemo").then((m) => m.BrandBrainDemo), { loading: () => <DemoSkeleton /> });
const SocialCopilotDemo = dynamic(() => import("./demos/SocialCopilotDemo").then((m) => m.SocialCopilotDemo), { loading: () => <DemoSkeleton /> });
const SearchDiscoveryDemo = dynamic(() => import("./demos/SearchDiscoveryDemo").then((m) => m.SearchDiscoveryDemo), { loading: () => <DemoSkeleton /> });
const CrmInboxDemo = dynamic(() => import("./demos/CrmInboxDemo").then((m) => m.CrmInboxDemo), { loading: () => <DemoSkeleton /> });
const MissionsDemo = dynamic(() => import("./demos/MissionsDemo").then((m) => m.MissionsDemo), { loading: () => <DemoSkeleton /> });

const DEMO_MAP: Record<ShowcaseTabId, ComponentType> = {
  dashboard: DashboardDemo,
  "brand-brain": BrandBrainDemo,
  social: SocialCopilotDemo,
  search: SearchDiscoveryDemo,
  crm: CrmInboxDemo,
  workforce: MissionsDemo,
};

function DemoSkeleton() {
  return (
    <div className="flex min-h-[280px] items-center justify-center bg-sx-surface-1">
      <p className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Loading preview…</p>
    </div>
  );
}

export function ProductShowcase({ standalone = true, className = "" }: { standalone?: boolean; className?: string }) {
  const [active, setActive] = useState<ShowcaseTabId>("dashboard");
  const [transitioning, setTransitioning] = useState(false);
  const activeTab = SHOWCASE_TABS.find((t) => t.id === active) ?? SHOWCASE_TABS[0];
  const ActiveDemo = DEMO_MAP[active];

  const selectTab = useCallback((id: ShowcaseTabId) => {
    if (id === active) return;
    setTransitioning(true);
    window.setTimeout(() => {
      setActive(id);
      setTransitioning(false);
    }, 150);
  }, [active]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = SHOWCASE_TABS.length;
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % count;
    else if (e.key === "ArrowLeft") next = (index - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    else return;
    e.preventDefault();
    selectTab(SHOWCASE_TABS[next]!.id);
  }, [selectTab]);

  const content = (
    <div className={`flex flex-col gap-8 ${className}`}>
      {standalone && (
        <FeatureSpotlight
          eyebrow="Inside the platform"
          title="Don't tell people Stratxcel is powerful. Show them."
          description="Explore real customer-facing modules — Command Center, Brand Brain, content approvals, search discovery, CRM, and missions — using illustrative workspace data."
          align="center"
        />
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <div className="lg:w-[min(100%,18rem)] lg:shrink-0">
          <FeatureSpotlight title={activeTab.headline} className="hidden lg:flex" />
          <nav
            className="mt-0 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:mt-6 lg:snap-none lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden"
            aria-label="Product areas"
            role="tablist"
          >
            {SHOWCASE_TABS.map((tab, index) => {
              const selected = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`showcase-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="showcase-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className={`relative min-h-10 shrink-0 snap-start rounded-sx-sm border px-3 py-2.5 text-left font-sx-sans text-xs font-medium transition-all duration-300 motion-reduce:transition-none lg:w-full ${
                    selected
                      ? "border-sx-accent bg-sx-accent-muted text-sx-text shadow-[0_0_20px_-6px_rgb(37_99_235/0.25)]"
                      : "border-sx-border text-sx-text-muted hover:border-sx-border-strong hover:text-sx-text"
                  }`}
                >
                  {selected && (
                    <span
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-sx-accent motion-reduce:hidden"
                      aria-hidden
                    />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="pointer-events-none absolute -inset-4 -z-10 rounded-sx-xl bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgb(37_99_235/0.06),transparent)] motion-reduce:hidden"
            aria-hidden
          />
          <WorkflowDemo>
            <div
              id="showcase-panel"
              role="tabpanel"
              aria-labelledby={`showcase-tab-${active}`}
              className={`transition-all duration-300 motion-reduce:transition-none ${
                transitioning ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
              }`}
            >
              <DemoBrowserFrame active>
                <ActiveDemo />
              </DemoBrowserFrame>
            </div>
          </WorkflowDemo>
        </div>
      </div>
    </div>
  );

  if (!standalone) return content;
  return (
    <section
      id="product-proof"
      data-marketing-section="product-proof"
      aria-label="Product proof showcase"
      className="border-b border-sx-border bg-sx-bg"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <ScrollReveal>{content}</ScrollReveal>
      </div>
    </section>
  );
}
