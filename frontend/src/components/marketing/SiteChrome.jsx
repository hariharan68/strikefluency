import { Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import {
  ChevronDown, Facebook, Github, Globe, Instagram,
  Linkedin, MessageCircle, Music2, PhoneCall, TrendingUp
} from 'lucide-react'
import useAuthStore from '../../store/authStore'

// All marketing pages, each its own route.
const PAGES = [
  { to: '/product', label: 'Product' },
  { to: '/discipline-engine', label: 'Discipline' },
  { to: '/scope', label: 'Scope' },
  { to: '/docs', label: 'Docs' },
  { to: '/blog', label: 'Blogs' },
  { to: '/varsity', label: 'Strike Varsity' },
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
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--color-surface)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 md:px-8">
        <Link to="/" className="flex flex-shrink-0 items-center gap-3 text-[var(--text)]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[0_9px_20px_rgba(37,99,235,0.28)]">
            <TrendingUp size={18} strokeWidth={2.5} />
          </span>
          <span className="sf-serif text-xl font-bold">StrikeFluency</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[var(--text-sub)] lg:flex">
          {PAGES.map(p => (
            <Link
              key={p.to}
              to={p.to}
              className={`hover:text-[var(--primary)] ${pathname === p.to ? 'text-[var(--primary)]' : ''}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-shrink-0 items-center gap-2">
          {isAuthenticated ? (
            <Link to="/dashboard" className="sf-btn-primary h-9 px-4 text-xs">Open Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="sf-btn-outline h-9 px-4 text-xs">Log in</Link>
              <Link to="/register" className="sf-btn-primary h-9 px-4 text-xs">Start free</Link>
            </>
          )}
        </div>
      </div>
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
    <footer className="border-t border-[var(--border)] bg-[#0e0e0e] text-[var(--text-sub)]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="flex justify-center">
          <span className="sf-serif text-4xl font-bold text-white">StrikeFluency</span>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="grid gap-10 sm:grid-cols-3">
            {footerColumns.map((group) => (
              <div key={group.title}>
                <h3 className="text-[22px] font-bold text-white">{group.title}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className="text-base text-[#93C5FD] hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lg:pl-8">
            <div className="flex items-center gap-3 text-sm font-semibold text-white">
              <Globe size={16} />
              English
              <ChevronDown size={14} className="text-[#B6B9C7]" />
            </div>
            <div className="mt-5 h-px w-full bg-white/25" />
            <p className="mt-6 max-w-xl text-base leading-7 text-[#B8CDEE]">
              StrikeFluency is a free virtual options trading simulator for Indian retail traders. It combines option-chain practice, discipline enforcement, journaling, analytics, and broker-ready market data workflows in one product.
            </p>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#B8CDEE]">
              The goal is deliberate practice: learn the process, review the evidence, and build consistency before moving to real capital.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4 text-[#D7DAE6]">
              {socialIcons.map((Icon, index) => (
                <a
                  key={index}
                  href="#"
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/0 hover:bg-white/10 hover:text-white"
                  aria-label="Social link"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 bg-[#080808]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-4 text-sm text-[#D7DAE6] md:flex-row md:px-8">
          <span>Website made with</span>
          <span className="sf-serif text-lg font-bold text-white">StrikeFluency</span>
        </div>
      </div>
    </footer>
  )
}
