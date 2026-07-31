import { Link } from 'react-router-dom'
import { BookText, Menu, Moon, Search, Sun, X } from 'lucide-react'
import useTheme from '../../hooks/useTheme'

const BACK_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/product', label: 'Product' },
  { to: '/varsity', label: 'Varsity' },
  { to: '/pricing', label: 'Pricing' },
]

export default function DocsHeader({ onOpenSearch, onToggleNav, navOpen }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navOpen}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text)] transition hover:border-[var(--primary-border)] hover:bg-[var(--primary-bg)] hover:text-[var(--primary)] lg:hidden"
        >
          {navOpen ? <X size={17} /> : <Menu size={17} />}
        </button>

        <Link to="/docs" className="flex flex-shrink-0 items-center gap-2.5 text-[var(--text)]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)] shadow-[0_9px_20px_-4px_rgba(var(--primary-glow-rgb),0.5)]">
            <BookText size={18} strokeWidth={2.4} />
          </span>
          <span className="sf-serif hidden text-lg font-bold sm:block">
            StrikeFluency <span className="text-[var(--text-muted)]">Docs</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--color-surface2)] pl-3 pr-1.5 text-[var(--text-muted)] transition hover:border-[var(--primary-border)] hover:text-[var(--text)] md:w-64"
          >
            <Search size={15} className="flex-shrink-0" />
            <span className="hidden flex-1 text-left text-sm md:block">Search…</span>
            <kbd className="hidden flex-shrink-0 rounded-md border border-[var(--border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-sans text-[10px] font-semibold md:block">
              Ctrl K
            </kbd>
          </button>

          <nav className="hidden items-center gap-1 text-sm font-semibold lg:flex">
            {BACK_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-full px-3 py-2 text-[var(--text-sub)] transition hover:bg-[var(--color-surface2)] hover:text-[var(--primary)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle light / dark theme"
            title="Toggle theme"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-[var(--border)] text-[var(--text-sub)] transition hover:border-[var(--primary-border)] hover:bg-[var(--primary-bg)] hover:text-[var(--primary)]"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  )
}
