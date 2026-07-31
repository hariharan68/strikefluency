import { useEffect, useState } from 'react'
import { List } from 'lucide-react'

// "On this page" rail with scroll-spy. The codebase had no IntersectionObserver
// usage before this, so the pattern is established here.
export default function DocsTOC({ headings }) {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    if (!headings.length) return undefined

    const elements = headings
      .map(heading => document.getElementById(heading.id))
      .filter(Boolean)
    if (!elements.length) return undefined

    // Track whichever observed heading sits highest in the viewport. The bottom
    // margin keeps the last heading selectable once the page can't scroll further.
    const visible = new Map()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top)
          else visible.delete(entry.target.id)
        }
        if (!visible.size) return
        const [topmost] = [...visible.entries()].sort((a, b) => a[1] - b[1])
        setActiveId(topmost[0])
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: 0 }
    )

    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  return (
    <nav aria-label="On this page" className="pt-10">
      <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <List size={13} /> On this page
      </p>
      <ul className="space-y-1 border-l border-[var(--border)]">
        {headings.map(heading => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={() => setActiveId(heading.id)}
              className={`-ml-px block border-l py-1 text-[13px] leading-5 transition ${
                heading.depth === 3 ? 'pl-6' : 'pl-4'
              } ${
                activeId === heading.id
                  ? 'border-[var(--primary)] font-semibold text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
