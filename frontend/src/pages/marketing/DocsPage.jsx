import { Link } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Rocket, Activity, ShieldCheck,
  BarChart3, Database, Lock, Search, FileText
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const categories = [
  {
    icon: Rocket, title: 'Getting started',
    text: 'Create your virtual account, understand capital tiers, and place your first practice order.',
    articles: ['Create your account', 'Your virtual capital', 'Place your first trade', 'The dashboard tour'],
  },
  {
    icon: Activity, title: 'Trading desk',
    text: 'Read the option chain, prefill orders, attach stop-loss and setup tags, and manage open positions.',
    articles: ['Reading the option chain', 'Order form & lots', 'Stop-loss & targets', 'Closing positions'],
  },
  {
    icon: ShieldCheck, title: 'Discipline engine',
    text: 'How each rule is checked before an order is accepted, and how to tune your rulebook.',
    articles: ['How rules run', 'Max trades & loss cap', 'Revenge cooldown', 'Editing your rules'],
  },
  {
    icon: BookOpen, title: 'Journal',
    text: 'Turn closed trades into journal entries with emotion tags, mistakes, and review notes.',
    articles: ['Auto-journaling', 'Emotion & mistake tags', 'Writing review notes'],
  },
  {
    icon: BarChart3, title: 'Analytics',
    text: 'Track P&L curve, discipline trend, win rate, and the habits behind your results.',
    articles: ['P&L curve', 'Discipline trend', 'Mistake breakdown'],
  },
  {
    icon: Database, title: 'Broker & market data',
    text: 'Run in mock mode by default, or connect Fyers credentials for live market-data workflows.',
    articles: ['Mock vs live data', 'Connect Fyers', 'The market broadcast'],
  },
]

const popular = [
  'How the discipline engine blocks an order',
  'Understanding the daily loss cap',
  'Connecting your Fyers account safely',
  'What the discipline score actually measures',
  'Resetting your virtual account',
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface2)]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Documentation</p>
            <h1 className="sf-serif mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-5xl">
              Everything you need to practice with discipline.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-sub)]">
              Guides for the trading desk, the discipline engine, journaling, analytics, and broker data — written for traders who want to build a repeatable process.
            </p>
            <div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow)]">
              <Search size={18} className="text-[var(--text-muted)]" />
              <input
                className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder="Search the docs…"
              />
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(({ icon: Icon, title, text, articles }) => (
              <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                <ul className="mt-4 space-y-2">
                  {articles.map((a) => (
                    <li key={a}>
                      <a href="#" className="flex items-center gap-2 text-sm text-[var(--text-sub)] hover:text-[var(--primary)]">
                        <FileText size={13} /> {a}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* Popular + CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface2)] py-16">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 md:px-8 lg:grid-cols-[1fr_0.8fr] lg:items-start">
            <div>
              <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">Popular articles</h2>
              <ul className="mt-6 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)]">
                {popular.map((p) => (
                  <li key={p}>
                    <a href="#" className="flex items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--primary-bg)]">
                      {p}
                      <ArrowRight size={15} className="text-[var(--text-muted)]" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                <Lock size={14} /> Free to practice
              </div>
              <h3 className="sf-serif text-xl font-bold text-[var(--text)]">Learn by doing.</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                The fastest way through the docs is to open the desk and place a rule-checked trade. Everything is virtual — no risk, no cost.
              </p>
              <Link to="/register" className="sf-btn-primary mt-6 h-11 w-full px-5">
                Start free practice <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
