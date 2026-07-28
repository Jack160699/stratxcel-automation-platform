import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Renders Agent responses as real formatted content instead of literal
 * `**bold**` markdown syntax. Deliberately does NOT enable rehype-raw, so
 * any HTML-looking text in a model response is shown as plain text rather
 * than executed — no dangerouslySetInnerHTML anywhere in this path.
 */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="text-sm leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: "var(--saut-text)" }}>
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <p className="mt-2 text-sm font-semibold" style={{ color: "var(--saut-text)" }}>{children}</p>,
  h2: ({ children }) => <p className="mt-2 text-sm font-semibold" style={{ color: "var(--saut-text)" }}>{children}</p>,
  h3: ({ children }) => <p className="mt-2 text-sm font-semibold" style={{ color: "var(--saut-text)" }}>{children}</p>,
  code: ({ children }) => (
    <code
      className="saut-mono rounded px-1 py-0.5 text-[12px]"
      style={{ background: "var(--saut-surface-3)", color: "var(--saut-ai)" }}
    >
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--saut-accent)" }}>
      {children}
    </a>
  ),
};

export function AgentMarkdown({ content }: { content: string }) {
  return (
    <div className="saut-markdown">
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
    </div>
  );
}
