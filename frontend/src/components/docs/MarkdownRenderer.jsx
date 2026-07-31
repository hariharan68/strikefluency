import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { slugify } from '../../content/docs/registry'

// Tailwind has no typography plugin here, so every markdown element is styled
// explicitly. All colours come from theme tokens so the four themes just work.

// Recovers the plain text of a heading so it can be turned into an anchor id
// that matches what DocsTOC generates.
function textOf(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.props?.children) return textOf(node.props.children)
  return ''
}

// scroll-mt-20 keeps anchored headings clear of the sticky h-16 header.
function Heading({ level, children }) {
  const Tag = `h${level}`
  const id = slugify(textOf(children))
  const size = {
    2: 'mt-12 text-2xl md:text-[27px]',
    3: 'mt-9 text-lg md:text-xl',
    4: 'mt-7 text-base',
  }[level]

  return (
    <Tag id={id} className={`group scroll-mt-20 font-bold leading-tight text-[var(--text)] ${size}`}>
      <a href={`#${id}`} className="no-underline hover:underline">
        {children}
        <span
          aria-hidden="true"
          className="ml-2 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </Tag>
  )
}

const components = {
  h1: ({ children }) => (
    <h1 className="sf-serif mt-0 text-3xl font-bold leading-tight text-[var(--text)] md:text-[40px]">{children}</h1>
  ),
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,

  p: ({ children }) => <p className="mt-4 text-[15px] leading-7 text-[var(--text-sub)]">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-[var(--text)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-10 border-0 border-t border-[var(--border)]" />,

  a: ({ href = '', children }) => {
    const external = /^https?:\/\//.test(href)
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="font-medium text-[var(--primary)] underline decoration-[var(--primary-border)] underline-offset-2 hover:decoration-[var(--primary)]"
      >
        {children}
      </a>
    )
  },

  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-[var(--text-sub)]">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-[var(--text-sub)]">{children}</ol>,
  li: ({ children }) => <li className="pl-1 marker:text-[var(--text-muted)]">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="my-6 rounded-r-xl border-l-[3px] border-[var(--primary)] bg-[var(--primary-bg)] px-5 py-1 [&>p]:text-[var(--text-sub)]">
      {children}
    </blockquote>
  ),

  code: ({ inline, children }) =>
    inline ? (
      <code className="rounded-md border border-[var(--border)] bg-[var(--color-surface2)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--text)]">
        {children}
      </code>
    ) : (
      <code className="font-mono text-[13px] leading-6 text-[var(--text-sub)]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--color-surface2)] p-4">
      {children}
    </pre>
  ),

  // Tables can be wide — they scroll inside their own container so the page body
  // never scrolls horizontally.
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--color-surface2)]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-[var(--border)] last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-4 py-2.5 align-top leading-6 text-[var(--text-sub)]">{children}</td>,
}

export default function MarkdownRenderer({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
