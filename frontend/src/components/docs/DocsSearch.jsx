import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, FileText, Search, X } from 'lucide-react'
import { searchDocs } from '../../content/docs/registry'

export default function DocsSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()

  const results = useMemo(() => searchDocs(query), [query])

  // Reset and focus each time the palette opens.
  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setCursor(0)
    const id = setTimeout(() => inputRef.current?.focus(), 20)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(id)
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => { setCursor(0) }, [query])

  // Keep the highlighted row in view when navigating with the keyboard.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const go = page => {
    onClose()
    navigate(`/docs/${page.slug}`)
  }

  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (!results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor(c => (c + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(c => (c - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[cursor].page)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        className="sf-mobile-nav relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <Search size={17} className="flex-shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search the documentation…"
            className="w-full bg-transparent py-4 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--color-surface2)] hover:text-[var(--text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {!query && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              Search across every page — rules, order types, brokers, charges.
            </p>
          )}
          {query && !results.length && (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              No results for “{query}”.
            </p>
          )}
          {results.map((result, index) => (
            <button
              key={result.page.slug}
              type="button"
              data-active={index === cursor}
              onClick={() => go(result.page)}
              onMouseEnter={() => setCursor(index)}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                index === cursor ? 'bg-[var(--primary-bg)]' : 'hover:bg-[var(--color-surface2)]'
              }`}
            >
              <FileText
                size={15}
                className={`mt-1 flex-shrink-0 ${index === cursor ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}
              />
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className={`text-sm font-semibold ${index === cursor ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>
                    {result.page.title}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">{result.page.section}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[var(--text-muted)]">
                  {result.snippet}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--color-surface2)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-[var(--border)] px-1">↑</kbd><kbd className="rounded border border-[var(--border)] px-1">↓</kbd> navigate</span>
          <span className="flex items-center gap-1.5"><CornerDownLeft size={11} /> open</span>
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-[var(--border)] px-1">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
