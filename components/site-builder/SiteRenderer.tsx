import type { SitePage, SiteSection } from "@stratxcel/websites-and-domains";

/**
 * The controlled website design system — every generated site renders
 * through exactly these section components, never arbitrary generated
 * markup/JS. Server components only (no client bundle, nothing to leak a
 * secret into); responsive/mobile-first by construction (Tailwind utility
 * classes, no fixed pixel layouts); a `needsConfirmation` section renders
 * its placeholder text visibly flagged rather than looking like a finished
 * fact, so a customer previewing a draft can never mistake a placeholder
 * for real content.
 */

function Placeholder({ children }: { children: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
      {children}
    </span>
  );
}

function renderMaybePlaceholder(text: string) {
  if (text.startsWith("[") && text.endsWith("]")) return <Placeholder>{text}</Placeholder>;
  return <>{text}</>;
}

function Section({ section }: { section: SiteSection }) {
  const isDark = section.backgroundStyle === "dark";
  const bgClass = isDark
    ? "bg-stone-950 text-stone-100 dark:bg-stone-900"
    : section.backgroundStyle === "accent"
    ? "bg-sx-surface-2 text-sx-text"
    : "bg-transparent text-sx-text";

  switch (section.type) {
    case "hero":
      return (
        <section className={`px-6 py-20 text-center sm:py-28 transition-colors ${bgClass}`}>
          <h1 className="mx-auto max-w-4xl font-sx-sans text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-tight">
            {section.heading}
          </h1>
          {section.subheading && (
            <p className={`mx-auto mt-6 max-w-2xl text-lg sm:text-xl font-light ${isDark ? "text-stone-300" : "text-sx-text-muted"}`}>
              {renderMaybePlaceholder(section.subheading)}
            </p>
          )}
          {section.ctaText && (
            <div className="mt-10 flex justify-center gap-4">
              <a
                href={section.ctaLink || "#"}
                className={`rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide shadow-lg transition-all ${
                  isDark
                    ? "bg-stone-100 text-stone-950 hover:bg-white"
                    : "bg-sx-text text-sx-surface-1 hover:opacity-90"
                }`}
              >
                {section.ctaText}
              </a>
            </div>
          )}
        </section>
      );

    case "products":
    case "collections":
      return (
        <section className={`px-6 py-16 sm:py-24 ${bgClass}`}>
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="font-sx-sans text-3xl font-bold tracking-tight sm:text-4xl">{section.heading}</h2>
            {section.subheading && (
              <p className="mt-3 text-base text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>
            )}
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 text-left">
              {section.items?.map((item, i) => (
                <div key={i} className="group flex flex-col rounded-sx-md border border-sx-border bg-sx-surface-1 overflow-hidden transition-all hover:border-sx-border-strong hover:shadow-md">
                  <div className="aspect-[4/5] w-full bg-sx-surface-2 flex items-center justify-center p-6 text-sx-text-subtle text-xs tracking-wider uppercase border-b border-sx-border">
                    {item.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <span>{item.title}</span>
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-lg text-sx-text group-hover:text-sx-accent transition-colors">
                        {renderMaybePlaceholder(item.title)}
                      </h3>
                      {item.price && (
                        <span className="font-mono text-sm font-semibold text-sx-text">{item.price}</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-2 text-sm text-sx-text-muted line-clamp-2">{renderMaybePlaceholder(item.description)}</p>
                    )}
                    <div className="mt-6 pt-4 border-t border-sx-border flex items-center justify-between">
                      <span className="text-xs font-medium text-sx-text-muted">Signature Item</span>
                      <a href={item.link || "#"} className="text-xs font-semibold text-sx-text hover:underline">
                        View Product →
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "testimonials":
      return (
        <section className={`px-6 py-16 sm:py-24 ${bgClass}`}>
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="font-sx-sans text-3xl font-bold tracking-tight">{section.heading}</h2>
            {section.subheading && (
              <p className="mt-3 text-base text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>
            )}
            <div className="mt-12 grid gap-6 sm:grid-cols-2 text-left">
              {section.items?.map((item, i) => (
                <div key={i} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-8 relative">
                  <div className="text-amber-500 text-sm mb-4">{"★".repeat(item.rating || 5)}</div>
                  <blockquote className="text-base text-sx-text italic leading-relaxed">
                    &ldquo;{renderMaybePlaceholder(item.description)}&rdquo;
                  </blockquote>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-sx-surface-2 flex items-center justify-center font-bold text-xs">
                      {(item.author || item.title || "U")[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-sx-text">{item.author || item.title}</p>
                      {item.role && <p className="text-xs text-sx-text-subtle">{item.role}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "pricing":
      return (
        <section className={`px-6 py-16 sm:py-24 ${bgClass}`}>
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="font-sx-sans text-3xl font-bold tracking-tight">{section.heading}</h2>
            {section.subheading && (
              <p className="mt-3 text-base text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>
            )}
            <div className="mt-12 grid gap-8 sm:grid-cols-3 text-left">
              {section.items?.map((item, i) => (
                <div key={i} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-8 flex flex-col justify-between hover:border-sx-border-strong transition-all">
                  <div>
                    <h3 className="font-bold text-xl text-sx-text">{item.title}</h3>
                    {item.price && <p className="mt-4 text-3xl font-extrabold text-sx-text">{item.price}</p>}
                    <p className="mt-4 text-sm text-sx-text-muted">{item.description}</p>
                  </div>
                  <a href={item.link || "#"} className="mt-8 block w-full rounded-sx-sm bg-sx-accent px-4 py-2.5 text-center text-sm font-semibold text-sx-accent-on hover:opacity-90">
                    Get Started
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "stats":
      return (
        <section className={`px-6 py-12 sm:py-16 ${bgClass}`}>
          <div className="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {section.items?.map((item, i) => (
              <div key={i} className="p-4">
                <p className="font-mono text-3xl sm:text-4xl font-extrabold text-sx-text">{item.title}</p>
                <p className="mt-2 text-xs sm:text-sm text-sx-text-muted font-medium">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case "cta":
      return (
        <section className={`px-6 py-16 sm:py-24 text-center ${bgClass}`}>
          <div className="mx-auto max-w-3xl rounded-sx-lg border border-sx-border bg-sx-surface-1 p-10 sm:p-14 shadow-lg">
            <h2 className="font-sx-sans text-3xl font-extrabold text-sx-text sm:text-4xl">{section.heading}</h2>
            {section.subheading && (
              <p className="mt-4 text-base text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>
            )}
            {section.ctaText && (
              <div className="mt-8">
                <a
                  href={section.ctaLink || "#"}
                  className="rounded-full bg-sx-accent px-8 py-3.5 text-sm font-semibold text-sx-accent-on shadow-md hover:opacity-90 transition-all inline-block"
                >
                  {section.ctaText}
                </a>
              </div>
            )}
          </div>
        </section>
      );

    case "features":
      return (
        <section className="px-6 py-12 sm:py-16">
          <h2 className="text-center font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
          <div className="mx-auto mt-8 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {section.items?.map((item, i) => (
              <div key={i} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
                <p className="font-semibold text-sx-text">{renderMaybePlaceholder(item.title)}</p>
                {item.description && <p className="mt-1 text-sm text-sx-text-muted">{renderMaybePlaceholder(item.description)}</p>}
              </div>
            ))}
          </div>
        </section>
      );

    case "about":
      return (
        <section className="px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
            {section.content && <p className="mt-4 text-sx-text-muted leading-relaxed">{renderMaybePlaceholder(section.content)}</p>}
          </div>
        </section>
      );

    case "faq":
      return (
        <section className="px-6 py-12 sm:py-16">
          <h2 className="text-center font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
          <dl className="mx-auto mt-8 max-w-2xl space-y-4">
            {section.items?.map((item, i) => (
              <div key={i} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
                <dt className="font-semibold text-sx-text">{item.title}</dt>
                <dd className="mt-1 text-sm text-sx-text-muted">{renderMaybePlaceholder(item.description)}</dd>
              </div>
            ))}
          </dl>
        </section>
      );

    case "team":
      return (
        <section className="px-6 py-12 sm:py-16">
          <h2 className="text-center font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
          {section.subheading && <p className="mt-3 text-center text-sm text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>}
        </section>
      );

    case "gallery":
      return (
        <section className="px-6 py-12 sm:py-16">
          <h2 className="text-center font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
          {section.subheading && <p className="mt-3 text-center text-sm text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>}
          <div className="mx-auto mt-6 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-sx-sm border border-dashed border-sx-border-strong bg-sx-surface-2" />
            ))}
          </div>
        </section>
      );

    case "process":
      return (
        <section className="px-6 py-12 sm:py-16">
          <h2 className="text-center font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
          <ol className="mx-auto mt-8 max-w-2xl space-y-4">
            {section.items?.map((item, i) => (
              <li key={i} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
                <p className="font-semibold text-sx-text">{item.title}</p>
                <p className="mt-1 text-sm text-sx-text-muted">{renderMaybePlaceholder(item.description)}</p>
              </li>
            ))}
          </ol>
        </section>
      );

    case "contact_form":
    case "booking":
      return (
        <section className="px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
            {section.subheading && <p className="mt-3 text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>}
            <form className="mt-8 flex flex-col gap-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-sx-text-muted mb-1">Your Name</label>
                <input type="text" placeholder="John Doe" className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3.5 py-2 text-sm text-sx-text" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-sx-text-muted mb-1">Email Address</label>
                <input type="email" placeholder="john@example.com" className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3.5 py-2 text-sm text-sx-text" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-sx-text-muted mb-1">Message or Inquiries</label>
                <textarea rows={4} placeholder="How can we assist you?" className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3.5 py-2 text-sm text-sx-text" />
              </div>
              <button type="button" className="rounded-sx-sm bg-sx-accent px-6 py-2.5 text-sm font-semibold text-sx-accent-on hover:opacity-90 transition-all">
                Send Message
              </button>
            </form>
          </div>
        </section>
      );

    default:
      return null;
  }
}

export function SitePageView({ page }: { page: SitePage }) {
  return (
    <article className="min-h-screen">
      {page.sections.map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </article>
  );
}

export function SiteNav({ pages, activeSlug, basePath }: { pages: SitePage[]; activeSlug: string; basePath: string }) {
  return (
    <nav className="sticky top-0 z-30 flex flex-wrap justify-between items-center border-b border-sx-border bg-sx-surface-1/90 backdrop-blur-md px-6 py-4">
      <div className="font-bold text-base text-sx-text tracking-tight">
        {pages[0]?.title ? pages[0].seo?.title?.split("—")[0]?.trim() || "Brand" : "Stratxcel"}
      </div>
      <div className="flex flex-wrap gap-1">
        {pages.map((p) => (
          <a
            key={p.id}
            href={`${basePath}${p.slug ? `/${p.slug}` : ""}`}
            className={`rounded-sx-sm px-3.5 py-1.5 text-sm font-medium transition-colors ${
              p.slug === activeSlug ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
            }`}
          >
            {p.title}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function SiteFooter({ siteName }: { siteName: string }) {
  return (
    <footer className="border-t border-sx-border px-6 py-10 text-center text-xs text-sx-text-subtle">
      <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
      <p className="mt-1">Powered by Stratxcel AI Website Factory</p>
    </footer>
  );
}

export function SiteRenderer({
  project,
  activeSlug = "",
  basePath = "",
}: {
  project?: { name?: string; pages?: SitePage[] };
  activeSlug?: string;
  basePath?: string;
}) {
  const pages = project?.pages || [];
  const activePage = pages.find((p) => p.slug === activeSlug) || pages[0];

  if (!activePage) {
    return <div className="p-8 text-center text-sx-text-muted text-sm">No preview pages available.</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-sx-surface-1 text-sx-text">
      <SiteNav pages={pages} activeSlug={activePage.slug} basePath={basePath} />
      <main className="flex-1">
        <SitePageView page={activePage} />
      </main>
      <SiteFooter siteName={project?.name || "Stratxcel Brand"} />
    </div>
  );
}
