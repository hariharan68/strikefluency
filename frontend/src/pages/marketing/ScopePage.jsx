import { Link } from 'react-router-dom'
import {
  ArrowRight, Activity, ShieldCheck, Layers, BookOpen, BarChart3, Database,
  Wallet, KeyRound, Server, ToggleRight, Check, Circle, CircleDot, Sparkles,
  ClipboardCheck, Target,
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const stats = [
  { value: 'Phase 1', label: 'Current build' },
  { value: '3', label: 'Indices supported' },
  { value: 'Mock-first', label: 'Safe by default' },
  { value: '₹0', label: 'Free, forever' },
]

const inScope = [
  { icon: Activity, title: 'Instruments', text: 'NIFTY, BANKNIFTY, and SENSEX options with canonical lot sizes and CE/PE strikes.' },
  { icon: Target, title: 'Virtual execution', text: 'Order placement with slippage, brokerage estimates, margin checks, a close flow, and live P&L updates.' },
  { icon: ShieldCheck, title: 'Discipline engine', text: 'Seven pre-trade rules checked before every order, with violations recorded for review.' },
  { icon: Layers, title: 'Strategy builder', text: 'Compose multi-leg option strategies, model the payoff, then mirror them straight to virtual orders.' },
  { icon: BookOpen, title: 'Trade journal', text: 'Closed trades become journal entries with emotion tags, mistake categories, and lessons.' },
  { icon: BarChart3, title: 'Analytics', text: 'P&L curve, win rate, discipline trend, mistake breakdown, and session quality over time.' },
  { icon: Database, title: 'Market data', text: 'Mock provider by default; the Fyers provider can be enabled through backend configuration.' },
  { icon: Wallet, title: 'Accounts & tiers', text: 'Per-user virtual accounts with disciplined capital tiers and streaks you unlock over time.' },
]

const steps = [
  { title: 'Create your virtual account', text: 'Register, receive a simulated trading account, and start from a controlled capital tier.' },
  { title: 'Practice inside the option-chain desk', text: 'Select an index, inspect strikes, prefill an order, add an SL and setup tag, then submit only if the rules pass.' },
  { title: 'Review every result', text: 'Close positions, journal the trade, inspect violations, and use analytics to refine your process.' },
]

const architecture = [
  { icon: KeyRound, title: 'JWT auth with silent refresh', text: 'Secure sessions that restore cleanly on reload, with single-use rotating refresh tokens.' },
  { icon: ShieldCheck, title: 'Guarded by default', text: 'Every endpoint is authenticated unless it is a reasoned public route — access is closed, then opened deliberately.' },
  { icon: Server, title: 'Full audit trail', text: 'Accounts, orders, positions, sessions, rules, violations, journal, and analytics are all persisted.' },
  { icon: ClipboardCheck, title: 'Per-user settings', text: 'Your rulebook, preferences, and desk layout are stored per account and drive the whole experience.' },
]

const dataModes = [
  {
    icon: Circle,
    badge: 'Default',
    title: 'Mock provider',
    text: 'Deterministic, safe simulated data that needs no credentials — perfect for pure practice and repeatable sessions.',
    tone: 'muted',
  },
  {
    icon: CircleDot,
    badge: 'Optional',
    title: 'Fyers provider',
    text: 'Connect Fyers credentials to enable live market-data workflows when your environment is configured for it.',
    tone: 'primary',
  },
]

const roadmap = [
  { status: 'Shipped', title: 'Phase 1 — Practice core', text: 'Virtual trading, the discipline engine, strategy builder, journaling, and analytics — everything on this page runs today.', done: true },
  { status: 'Exploring', title: 'Deeper analytics', text: 'Richer process-quality breakdowns and setup-level performance views. Being explored, not yet committed.', done: false },
  { status: 'Exploring', title: 'More strategy templates', text: 'A library of ready-made multi-leg structures to practice against. Being explored, not yet committed.', done: false },
  { status: 'Exploring', title: 'Expanded live data', text: 'Broader live market-data coverage and configuration options. Being explored, not yet committed.', done: false },
]

const boundaries = [
  'No real-money orders or brokerage execution',
  'No tips, signals, or advisory calls',
  'Not a replacement for a live broker terminal',
  'Not financial advice — it is a practice environment',
]

export default function ScopePage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--color-surface2)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(120% 120% at 85% -10%, rgba(var(--primary-glow-rgb),0.12) 0%, transparent 55%)' }}
          />
          <div className="relative mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-bg)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
              <Sparkles size={13} /> Current project scope
            </span>
            <h1 className="sf-serif mt-5 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-6xl">
              What StrikeFluency is built to do right now.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-sub)] md:text-lg">
              The current build is Phase 1: virtual options trading with mock market data by default, plus optional
              Fyers integration for configured environments. This page is an honest map of what ships today — and what
              is still on the horizon.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="sf-btn-primary h-11 px-5">
                Start free practice <ArrowRight size={16} />
              </Link>
              <a href="#roadmap" className="sf-btn-outline h-11 px-5">
                See the roadmap
              </a>
            </div>
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface)]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-[var(--border)] px-5 md:grid-cols-4 md:px-8">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-8 text-center first:pl-0 last:pr-0">
                <div className="sf-serif text-2xl font-bold text-[var(--primary)] md:text-3xl">{s.value}</div>
                <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* In scope now */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Live today</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Everything in scope right now</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              These aren’t promises — every capability below is running in the current build on a free virtual account.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {inScope.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={20} />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gain-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gain-text)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--gain)]" /> Live
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* The practice loop */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">How it works</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A simple loop for deliberate practice</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                Three repeatable steps: set up, practice under rules, and review the evidence. Run the loop enough times
                and the process becomes a habit.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <article key={step.title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                  <div className="num mb-5 grid h-11 w-11 place-items-center rounded-xl text-sm font-bold text-[var(--on-primary)]" style={{ background: 'var(--accent-gradient)' }}>0{index + 1}</div>
                  <h3 className="text-base font-bold text-[var(--text)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Under the hood — architecture & security */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Under the hood</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Built on a secure, auditable core</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              Practice only matters if your history is trustworthy. The data model is designed so nothing about a
              session is lost or unaccounted for.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {architecture.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Market data modes */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Market data</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Mock-first, Fyers-ready</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                Practice safely without any external setup, then opt into live data when you are ready and configured.
              </p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {dataModes.map(({ icon: Icon, badge, title, text, tone }) => (
                <div
                  key={title}
                  className={`rounded-2xl border bg-[var(--color-surface)] p-7 shadow-[var(--shadow)] ${
                    tone === 'primary' ? 'border-[var(--primary-border)]' : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                      <Icon size={20} />
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      tone === 'primary'
                        ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                        : 'bg-[var(--color-surface2)] text-[var(--text-muted)]'
                    }`}>
                      {badge}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section id="roadmap" className="scroll-mt-20 mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">On the horizon</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Where it goes from here</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              Phase 1 is shipped and stable. Everything beyond it is being explored, not promised — so you always know
              exactly what you are signing up for.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roadmap.map(({ status, title, text, done }) => (
              <article
                key={title}
                className={`rounded-2xl border p-6 shadow-[var(--shadow)] ${
                  done ? 'border-[var(--primary-border)] bg-[var(--primary-bg)]' : 'border-[var(--border)] bg-[var(--color-surface)]'
                }`}
              >
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  done ? 'bg-[var(--gain-bg)] text-[var(--gain-text)]' : 'bg-[var(--color-surface2)] text-[var(--text-muted)]'
                }`}>
                  {done ? <Check size={12} /> : <Circle size={9} />} {status}
                </span>
                <h3 className="mt-4 text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Scope boundaries */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Clear boundaries</p>
                <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">What is deliberately out of scope</h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                  StrikeFluency stays a practice environment on purpose. Knowing what it will never be is as important as
                  knowing what it does.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {boundaries.map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm leading-6 text-[var(--text-muted)] shadow-[var(--shadow)]">
                    <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[var(--color-surface2)] text-[var(--text-muted)]">
                      <ToggleRight size={13} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[var(--color-surface)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div
              className="relative overflow-hidden rounded-3xl border border-[var(--primary-border)] bg-[var(--color-surface2)] p-8 md:p-12"
              style={{ background: 'radial-gradient(120% 140% at 90% 0%, rgba(var(--primary-glow-rgb),0.14) 0%, var(--color-surface2) 55%)' }}
            >
              <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                    <Sparkles size={14} /> Try the current build
                  </div>
                  <h2 className="sf-serif text-2xl font-bold text-[var(--text)] md:text-3xl">Everything above runs today.</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                    Open a free virtual account and put the current scope to work — no card, no cost, no waiting.
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-3">
                  <Link to="/register" className="sf-btn-primary h-11 px-5">
                    Start free practice <ArrowRight size={16} />
                  </Link>
                  <Link to="/product" className="sf-btn-outline h-11 px-5">
                    Explore the product
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
