import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";

/**
 * sx-token styled Markdown renderer for Growth Assistant replies — the
 * customer-app equivalent of admin's AgentMarkdown.tsx (which is styled
 * against the saut-* stylesheet this surface doesn't load). Same library,
 * same deliberate omission of rehype-raw (no HTML execution from a model
 * response), different token set.
 */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="text-[14px] leading-relaxed text-sx-text [&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-sx-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] text-sx-text">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[14px] text-sx-text">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <p className="mt-2 text-[14px] font-semibold text-sx-text">{children}</p>,
  h2: ({ children }) => <p className="mt-2 text-[14px] font-semibold text-sx-text">{children}</p>,
  h3: ({ children }) => <p className="mt-2 text-[14px] font-semibold text-sx-text">{children}</p>,
  code: ({ children }) => <code className="rounded bg-sx-surface-2 px-1 py-0.5 text-[12px] text-sx-accent">{children}</code>,
  a: ({ children, href }) => {
    if (href && href.startsWith("/")) {
      return (
        <Link href={href} className="inline-flex items-center gap-1 font-semibold text-sx-accent hover:underline">
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-sx-accent underline">
        {children}
      </a>
    );
  },
};

export function SxAgentMarkdown({ content }: { content: string }) {
  return <ReactMarkdown components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>;
}
