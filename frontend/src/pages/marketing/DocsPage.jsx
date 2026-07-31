import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react'
import { adjacentPages, firstPage, getPage } from '../../content/docs/registry'
import MarkdownRenderer from '../../components/docs/MarkdownRenderer'
import DocsTOC from '../../components/docs/DocsTOC'

const STATUS_NOTE = {
  partial: 'Some of what follows is visible in the app but not fully wired up yet. The gaps are called out inline.',
  'coming-soon': 'This area is not built yet. The page describes what is planned so you know what to expect.',
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          // Clipboard is unavailable over plain HTTP or without permission —
          // silently leave the button in its resting state.
        }
      }}
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-sub)] transition hover:border-[var(--primary-border)] hover:text-[var(--primary)]"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function NotFound({ slug }) {
  return (
    <main className="min-w-0 py-16">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">404</p>
      <h1 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">No such page</h1>
      <p className="mt-4 max-w-lg text-[15px] leading-7 text-[var(--text-sub)]">
        There is no documentation page at <code className="rounded-md border border-[var(--border)] bg-[var(--color-surface2)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--text)]">/docs/{slug}</code>.
        Use the sidebar or press <kbd className="rounded border border-[var(--border)] px-1 text-xs">Ctrl K</kbd> to search.
      </p>
      {firstPage && (
        <Link to={`/docs/${firstPage.slug}`} className="sf-btn-primary mt-8 h-11 px-5">
          Start at the beginning <ArrowRight size={16} />
        </Link>
      )}
    </main>
  )
}

export default function DocsPage() {
  const { slug } = useParams()
  const { hash } = useLocation()
  const activeSlug = slug || firstPage?.slug
  const page = activeSlug ? getPage(activeSlug) : null

  // Land on the right heading when arriving at /docs/x#section. The shared
  // useHashScroll helper is hard-gated to the landing page, so this is its own.
  useEffect(() => {
    if (!hash || !page) return undefined
    const id = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(id)
  }, [hash, page])

  useEffect(() => {
    document.title = page ? `${page.title} · StrikeFluency Docs` : 'StrikeFluency Docs'
  }, [page])

  if (!page) return <NotFound slug={slug} />

  const { prev, next } = adjacentPages(page.slug)
  const note = STATUS_NOTE[page.status]

  return (
    <>
      <main className="min-w-0 pb-20 pt-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{page.section}</p>
            {page.description && (
              <p className="sr-only">{page.description}</p>
            )}
          </div>
          <CopyButton text={page.body} />
        </div>

        {note && (
          <p className="mt-5 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-sm leading-6 text-[var(--text-sub)]">
            {note}
          </p>
        )}

        <article className="mt-4 max-w-3xl">
          <MarkdownRenderer>{page.body}</MarkdownRenderer>
        </article>

        <nav className="mt-16 grid max-w-3xl gap-3 border-t border-[var(--border)] pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              to={`/docs/${prev.slug}`}
              className="group rounded-xl border border-[var(--border)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--primary-border)] hover:shadow-[var(--shadow)]"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                <ArrowLeft size={12} /> Previous
              </span>
              <span className="mt-1.5 block text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/docs/${next.slug}`}
              className="group rounded-xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-right transition hover:border-[var(--primary-border)] hover:shadow-[var(--shadow)] sm:col-start-2"
            >
              <span className="flex items-center justify-end gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Next <ArrowRight size={12} />
              </span>
              <span className="mt-1.5 block text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">
                {next.title}
              </span>
            </Link>
          )}
        </nav>
      </main>

      <aside className="hidden xl:block">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto pb-10">
          <DocsTOC headings={page.headings} />
        </div>
      </aside>
    </>
  )
}
