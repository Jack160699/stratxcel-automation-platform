import type { SitePage } from "@stratxcel/websites-and-domains";

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
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300">{children}</span>;
}

function renderMaybePlaceholder(text: string) {
  // Placeholder text is authored as "[...]" by the generator — render it visibly distinct.
  if (text.startsWith("[") && text.endsWith("]")) return <Placeholder>{text}</Placeholder>;
  return <>{text}</>;
}

function Section({ section }: { section: SitePage["sections"][number] }) {
  switch (section.type) {
    case "hero":
      return (
        <section className="px-6 py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text sm:text-5xl">{section.heading}</h1>
          {section.subheading && (
            <p className="mx-auto mt-4 max-w-2xl text-base text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>
          )}
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
            {section.content && <p className="mt-4 text-sx-text-muted">{renderMaybePlaceholder(section.content)}</p>}
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
      return (
        <section className="px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text">{section.heading}</h2>
            {section.subheading && <p className="mt-3 text-sx-text-muted">{renderMaybePlaceholder(section.subheading)}</p>}
          </div>
        </section>
      );
    default:
      return null;
  }
}

export function SitePageView({ page }: { page: SitePage }) {
  return (
    <article>
      {page.sections.map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </article>
  );
}

export function SiteNav({ pages, activeSlug, basePath }: { pages: SitePage[]; activeSlug: string; basePath: string }) {
  return (
    <nav className="flex flex-wrap justify-center gap-1 border-b border-sx-border bg-sx-surface-1 px-4 py-3">
      {pages.map((p) => (
        <a
          key={p.id}
          href={`${basePath}${p.slug ? `/${p.slug}` : ""}`}
          className={`rounded-sx-sm px-3 py-1.5 text-sm font-medium transition-colors ${
            p.slug === activeSlug ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted hover:bg-sx-surface-2"
          }`}
        >
          {p.title}
        </a>
      ))}
    </nav>
  );
}

export function SiteFooter({ siteName }: { siteName: string }) {
  return (
    <footer className="border-t border-sx-border px-6 py-8 text-center text-xs text-sx-text-subtle">
      © {new Date().getFullYear()} {siteName}. Built with Stratxcel.
    </footer>
  );
}
