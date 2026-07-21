import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, BarChart3, BookOpen, Database, ShieldCheck, Target,
  Check, Gauge, Lock, Ban, Repeat, Clock, AlertTriangle, Tag,
  ToggleRight, Layers, LineChart, Wallet, Sparkles, Trophy, PieChart, X,
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const stats = [
  { value: '7', label: 'Pre-trade discipline rules' },
  { value: '₹0', label: '100% free, forever' },
  { value: '3', label: 'Indices — NIFTY, BANKNIFTY, SENSEX' },
  { value: '∞', label: 'Unlimited practice sessions' },
]

const features = [
  {
    icon: Activity,
    title: 'Virtual options trading desk',
    text: 'Practice NIFTY, BANKNIFTY, and SENSEX CE/PE orders with live option-chain prices, lot sizing, stop-loss, targets, and open-position tracking.',
  },
  {
    icon: ShieldCheck,
    title: 'Discipline engine before every order',
    text: 'Rules such as max trades per day, mandatory SL, no averaging down, no direction flip, revenge cooldown, daily loss cap, and setup tags run before an order is accepted.',
  },
  {
    icon: BookOpen,
    title: 'Automatic trade journal',
    text: 'Closed trades become journal entries so you can add emotion tags, mistake categories, review notes, and lessons from each session.',
  },
  {
    icon: BarChart3,
    title: 'Analytics for process quality',
    text: 'Track P&L curve, win rate, discipline trend, mistake breakdown, daily session quality, and the habits behind your results.',
  },
  {
    icon: Layers,
    title: 'Multi-leg strategy builder',
    text: 'Compose spreads, straddles, and custom multi-leg structures, model the payoff with fair-value pricing, then mirror them straight to virtual orders.',
  },
  {
    icon: Database,
    title: 'Mock-first, Fyers-ready market data',
    text: 'Run safely in mock mode by default, or connect Fyers credentials for live market-data workflows when configured.',
  },
]

const rules = [
  { icon: Gauge, title: 'Max trades per day', text: 'A hard daily cap that stops overtrading before it starts.' },
  { icon: Lock, title: 'Mandatory stop-loss', text: 'Every order must carry a stop-loss — no naked risk gets through.' },
  { icon: Ban, title: 'No averaging down', text: 'Adding to a losing position is blocked at order entry.' },
  { icon: Repeat, title: 'No direction flip', text: 'Impulsive reversals on the same instrument are rejected.' },
  { icon: Clock, title: 'Revenge-trade cooldown', text: 'A forced pause after a loss so you re-enter with a clear head.' },
  { icon: AlertTriangle, title: 'Daily loss cap', text: 'The session halts automatically once your loss limit is hit.' },
  { icon: Tag, title: 'Setup tags required', text: 'Every trade needs a documented setup — no reason, no fill.' },
]

const loop = [
  { step: '01', title: 'Place a trade', text: 'Build an order on the desk or from the strategy builder with real option-chain pricing.' },
  { step: '02', title: 'Rules are checked', text: 'The discipline engine validates all seven rules before the order is accepted.' },
  { step: '03', title: 'Everything is tracked', text: 'Accounts, orders, positions, and rule violations are recorded automatically.' },
  { step: '04', title: 'Auto-journaled on close', text: 'Closed trades flow into the journal for emotion tags, mistakes, and lessons.' },
  { step: '05', title: 'Review the evidence', text: 'Analytics turn your history into a discipline trend you can actually improve.' },
]

const analytics = [
  { icon: LineChart, label: 'P&L curve' },
  { icon: Trophy, label: 'Win rate' },
  { icon: ShieldCheck, label: 'Discipline trend' },
  { icon: PieChart, label: 'Mistake breakdown' },
  { icon: Activity, label: 'Session quality' },
  { icon: Target, label: 'Streaks & tiers' },
]

const isList = [
  'A practice workspace to rehearse process quality',
  'Rule-enforced simulated execution with real option-chain data',
  'A journal and analytics system built around your habits',
  'Free virtual capital with disciplined tiers and streaks',
]

const isntList = [
  'A real-money broker terminal or execution venue',
  'A tips, signals, or “sure-shot” calls service',
  'A get-rich-quick shortcut around learning the process',
  'A place where impulsive, unplanned trades slip through',
]

export default function ProductPage() {
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
              <Sparkles size={13} /> Product
            </span>
            <h1 className="sf-serif mt-5 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-6xl">
              A compact trading practice workspace, not a broker terminal.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-sub)] md:text-lg">
              StrikeFluency is built for simulated execution, discipline training, journaling, and analytics —
              designed to help Indian retail traders rehearse process quality before risking real capital.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="sf-btn-primary h-11 px-5">
                Start free practice <ArrowRight size={16} />
              </Link>
              <Link to="/discipline-engine" className="sf-btn-outline h-11 px-5">
                Explore the discipline engine
              </Link>
            </div>
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface)]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-[var(--border)] px-5 md:grid-cols-4 md:px-8">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-8 text-center first:pl-0 last:pr-0">
                <div className="sf-serif text-3xl font-bold text-[var(--primary)] md:text-4xl">{s.value}</div>
                <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Everything in one workspace</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Built for deliberate practice</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              Each part of the product exists to make your process visible — from the moment you place an order to the review that follows.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Discipline engine — the seven rules */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">The discipline engine</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Seven rules run before every order</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                Discipline is the hero of StrikeFluency. Every order passes through a pre-trade check — if a rule is broken,
                the trade is stopped and the reason is logged, so bad habits never quietly compound.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rules.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow)]">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Discipline Mode master switch */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--primary-border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                <ShieldCheck size={14} /> Guardrails ON
              </div>
              <h3 className="text-lg font-bold text-[var(--text)]">Disciplined mode</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">
                All seven rules are enforced and your disciplined capital is at stake. Every trade counts toward your
                discipline score, streaks, and tier progression — this is how you build real habits.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-surface2)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]">
                <ToggleRight size={14} /> Free play OFF
              </div>
              <h3 className="text-lg font-bold text-[var(--text)]">Free-play mode</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">
                Flip the master switch to bypass the rules and unlock ₹10L to experiment freely. Those trades are flagged
                as free play and excluded from your discipline score, so exploration never pollutes your real progress.
              </p>
            </div>
          </div>
        </section>

        {/* Workflow loop */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">How it works</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A simple loop for deliberate practice</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                Learn the process, review the evidence, and build consistency before moving to real capital.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              {loop.map(({ step, title, text }) => (
                <article key={step} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow)]">
                  <div className="num mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">{step}</div>
                  <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Analytics */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Analytics</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">See the habits behind your results</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                P&amp;L is kept calm and secondary on purpose. The dashboard puts process quality first — so you can tell
                the difference between a good decision and a lucky outcome, and fix what actually matters.
              </p>
              <Link to="/register" className="sf-btn-primary mt-6 h-11 px-5">
                Open your dashboard <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {analytics.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow)]">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={18} />
                  </div>
                  <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it is / isn't */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Set expectations</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">What StrikeFluency is — and isn&apos;t</h2>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
                <h3 className="text-base font-bold text-[var(--text)]">What it is</h3>
                <ul className="mt-4 space-y-3">
                  {isList.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-sub)]">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[var(--primary-bg)] text-[var(--primary)]">
                        <Check size={13} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
                <h3 className="text-base font-bold text-[var(--text)]">What it isn&apos;t</h3>
                <ul className="mt-4 space-y-3">
                  {isntList.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-muted)]">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[var(--color-surface2)] text-[var(--text-muted)]">
                        <X size={13} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
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
                    <Wallet size={14} /> 100% free
                  </div>
                  <h2 className="sf-serif text-2xl font-bold text-[var(--text)] md:text-3xl">Rehearse the process, then trade for real.</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                    Open a free virtual account and place your first rule-checked trade — no card, no cost, no pressure.
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-3">
                  <Link to="/register" className="sf-btn-primary h-11 px-5">
                    Start free practice <ArrowRight size={16} />
                  </Link>
                  <Link to="/scope" className="sf-btn-outline h-11 px-5">
                    See the roadmap
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
