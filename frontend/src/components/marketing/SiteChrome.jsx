import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  ChevronDown, Code2, Facebook, Github, Globe, Instagram,
  Linkedin, Menu, MessageCircle, Moon, Music2, PhoneCall, Sun, TrendingUp, X
} from 'lucide-react'
import useAuthStore from '../../store/authStore'

// Same theme mechanism the app TopBar uses (root class + localStorage).
function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  return localStorage.getItem('sf-theme') || 'dark'
}

// All marketing pages, each its own route.
const PAGES = [
  { to: '/', label: 'Home' },
  { to: '/product', label: 'Product' },
  { to: '/discipline-engine', label: 'Discipline' },
  { to: '/scope', label: 'Scope' },
  { to: '/docs', label: 'Docs' },
  { to: '/blog', label: 'Blogs' },
  { to: '/varsity', label: 'Strike Varsity' },
  { to: '/pricing', label: 'Pricing' },
]

// Smooth-scrolls to the hash target after the landing page mounts (covers
// SPA navigations from another page, where the browser won't auto-scroll).
export function useHashScroll() {
  const { hash, pathname } = useLocation()
  useEffect(() => {
    if (pathname === '/' && hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }, [hash, pathname])
}

export function LandingNav() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const { pathname } = useLocation()
  const [theme, setTheme] = useState(getInitialTheme)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')
    localStorage.setItem('sf-theme', theme)
  }, [theme])

  // Close the mobile menu on navigation and lock body scroll while it's open.
  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light / dark theme"
      title="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--text-sub)] transition hover:text-[var(--primary)] hover:border-[var(--primary-border)] hover:bg-[var(--primary-bg)]"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )

  const authButtons = isAuthenticated ? (
    <Link to="/dashboard" className="sf-btn-primary h-9 px-4 text-xs">Open Dashboard</Link>
  ) : (
    <>
      <Link to="/login" className="sf-btn-outline h-9 px-4 text-xs">Log in</Link>
      <Link to="/register" className="sf-btn-primary h-9 px-4 text-xs">Start free</Link>
    </>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 md:px-8">
        <Link to="/" className="flex flex-shrink-0 items-center gap-3 text-[var(--text)]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)] shadow-[0_9px_20px_-4px_rgba(var(--primary-glow-rgb),0.5)]">
            <TrendingUp size={18} strokeWidth={2.5} />
          </span>
          <span className="sf-serif text-xl font-bold">StrikeFluency</span>
        </Link>

        {/* Desktop nav — pill links with an active-state highlight. */}
        <nav className="hidden items-center gap-1 text-sm font-semibold lg:flex">
          {PAGES.map(p => {
            const active = pathname === p.to
            return (
              <Link
                key={p.to}
                to={p.to}
                className={`rounded-full px-3.5 py-2 transition ${
                  active
                    ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                    : 'text-[var(--text-sub)] hover:text-[var(--primary)] hover:bg-[var(--color-surface2)]'
                }`}
              >
                {p.label}
              </Link>
            )
          })}
        </nav>

        {/* Desktop actions */}
        <div className="hidden flex-shrink-0 items-center gap-2 lg:flex">
          {themeButton}
          {authButtons}
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-2 lg:hidden">
          {themeButton}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] text-[var(--text)] transition hover:text-[var(--primary)] hover:border-[var(--primary-border)] hover:bg-[var(--primary-bg)]"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          />
          <div className="sf-mobile-nav absolute inset-x-0 top-16 z-50 border-b border-[var(--border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] lg:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4 text-sm font-semibold md:px-8">
              {PAGES.map(p => {
                const active = pathname === p.to
                return (
                  <Link
                    key={p.to}
                    to={p.to}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 transition ${
                      active
                        ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                        : 'text-[var(--text-sub)] hover:bg-[var(--color-surface2)] hover:text-[var(--primary)]'
                    }`}
                  >
                    {p.label}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />}
                  </Link>
                )
              })}
              <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                {isAuthenticated ? (
                  <Link to="/dashboard" className="sf-btn-primary h-11 w-full">Open Dashboard</Link>
                ) : (
                  <>
                    <Link to="/login" className="sf-btn-outline h-11 w-full">Log in</Link>
                    <Link to="/register" className="sf-btn-primary h-11 w-full">Start free</Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </header>
  )
}

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Product', to: '/product' },
      { label: 'Discipline', to: '/discipline-engine' },
      { label: 'Scope', to: '/scope' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Docs', to: '/docs' },
      { label: 'Blogs', to: '/blog' },
      { label: 'Strike Varsity', to: '/varsity' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Create account', to: '/register' },
      { label: 'Log in', to: '/login' },
    ],
  },
]

const socialIcons = [Facebook, Github, Linkedin, Instagram, Music2, PhoneCall, MessageCircle]

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--footer-bg)] text-[var(--footer-text)]">
      <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
        <div className="flex justify-center">
          <span className="sf-serif text-3xl font-bold text-[var(--footer-heading)]">StrikeFluency</span>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="grid gap-8 sm:grid-cols-3">
            {footerColumns.map((group) => (
              <div key={group.title}>
                <h3 className="text-[22px] font-bold text-[var(--footer-heading)]">{group.title}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className="text-base text-[var(--footer-link)] hover:text-[var(--footer-link-hover)]">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lg:pl-8">
            <div className="flex items-center gap-3 text-sm font-semibold text-[var(--footer-heading)]">
              <Globe size={16} />
              English
              <ChevronDown size={14} className="text-[var(--footer-sub)]" />
            </div>
            <div className="mt-4 h-px w-full bg-[var(--footer-divider)]" />
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--footer-muted)]">
              StrikeFluency is a free virtual options trading simulator for Indian retail traders. It combines option-chain practice, discipline enforcement, journaling, analytics, and broker-ready market data workflows in one product.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--footer-muted)]">
              The goal is deliberate practice: learn the process, review the evidence, and build consistency before moving to real capital.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-[var(--footer-text)]">
              {socialIcons.map((Icon, index) => (
                <a
                  key={index}
                  href="#"
                  className="grid h-8 w-8 place-items-center rounded-full border border-[var(--footer-social-border)] hover:bg-[var(--footer-social-hover)] hover:text-[var(--footer-heading)]"
                  aria-label="Social link"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--footer-divider)] bg-[var(--footer-bg2)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-4 text-sm text-[var(--footer-text)] md:flex-row md:px-8">
          <span className="flex items-center gap-2">
            Website made with
            <span className="sf-serif text-lg font-bold text-[var(--footer-heading)]">StrikeFluency</span>
          </span>
          <a
            href="https://madewithloveinindia.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[var(--footer-muted)] transition hover:text-[var(--footer-heading)]"
          >
            Made with <span aria-label="Love" style={{ color: '#f43f5e' }}>&hearts;</span> in India
          </a>
          <a
            href="https://triecore.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--footer-social-border)] bg-[var(--footer-social-hover)] px-3.5 py-1.5 text-xs font-semibold text-[var(--footer-muted)] transition hover:border-[var(--primary-border)] hover:text-[var(--footer-heading)]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--primary)] text-[var(--on-primary)]">
              <Code2 size={12} />
            </span>
            <span>
              Developed by{' '}
              <span className="font-bold text-[var(--footer-heading)]">Triecore Technologies</span>
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
