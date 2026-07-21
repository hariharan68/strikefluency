import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Database,
  Lock,
  ShieldCheck,
  Target
} from 'lucide-react'
import useAuthStore from '../store/authStore'
import { LandingNav, SiteFooter, useHashScroll } from '../components/marketing/SiteChrome'

const features = [
  {
    icon: Activity,
    title: 'Virtual options trading desk',
    text: 'Practice NIFTY, BANKNIFTY, and SENSEX CE/PE orders with option-chain prices, lots, stop-loss, targets, and open-position tracking.'
  },
  {
    icon: ShieldCheck,
    title: 'Discipline engine before every order',
    text: 'Rules such as max trades per day, mandatory SL, no averaging down, no direction flip, revenge cooldown, daily loss cap, and setup tags run before an order is accepted.'
  },
  {
    icon: BookOpen,
    title: 'Automatic trade journal',
    text: 'Closed trades become journal entries so you can add emotion tags, mistake categories, review notes, and lessons from each session.'
  },
  {
    icon: BarChart3,
    title: 'Analytics for process quality',
    text: 'Track P&L curve, win rate, discipline trend, mistake breakdown, daily session quality, and the habits behind your results.'
  },
  {
    icon: Database,
    title: 'Mock-first, Fyers-ready market data',
    text: 'Run safely in mock mode by default, or connect Fyers credentials for live market-data workflows when configured.'
  },
  {
    icon: Target,
    title: 'Capital tiers and streaks',
    text: 'Start with virtual capital and use disciplined trade streaks to unlock higher simulation tiers over time.'
  }
]

const rules = [
  'Max trades per day',
  'Mandatory stop-loss',
  'No averaging down',
  'No direction flip',
  'Revenge cooldown',
  'Daily loss cap',
  'Mandatory setup tag'
]

const steps = [
  {
    title: 'Create your virtual account',
    text: 'Register, receive a simulated trading account, and start from a controlled capital tier.'
  },
  {
    title: 'Practice inside the option-chain desk',
    text: 'Select an index, inspect strikes, prefill orders, add SL and setup tags, then submit only if rules pass.'
  },
  {
    title: 'Review every result',
    text: 'Close positions, journal the trade, inspect violations, and use analytics to refine your process.'
  }
]

function HeroMockup() {
  return (
    <div className="relative rounded-[24px] border border-[var(--border)] bg-[var(--color-surface)] p-3 shadow-[0_32px_80px_-24px_rgba(17,24,39,0.28)]">
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--color-surface2)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">Trading desk</p>
            <h3 className="mt-1 text-sm font-bold text-[var(--text)]">NIFTY option chain</h3>
          </div>
          <span className="rounded-full border border-[rgba(49,221,106,0.3)] bg-[var(--gain-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--gain-text)]">Market simulation</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_190px]">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--tile)]">
            <div className="grid grid-cols-5 border-b border-[var(--border)] bg-[var(--color-surface2)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <span>CE LTP</span><span>OI</span><span className="text-center">Strike</span><span>OI</span><span className="text-right">PE LTP</span>
            </div>
            {[24850, 24900, 24950, 25000, 25050, 25100].map((strike, index) => (
              <div key={strike} className={`grid grid-cols-5 items-center border-b border-[var(--border)] px-3 py-2 text-xs ${strike === 25000 ? 'bg-[var(--primary-bg)]' : ''}`}>
                <span className="num font-semibold text-[var(--gain)]">{(132 - index * 8).toFixed(2)}</span>
                <span className="num text-[var(--text-muted)]">{(8.2 + index).toFixed(1)}L</span>
                <span className="num text-center font-bold text-[var(--text)]">{strike}</span>
                <span className="num text-[var(--text-muted)]">{(7.5 + index * 1.1).toFixed(1)}L</span>
                <span className="num text-right font-semibold text-[var(--loss)]">{(118 + index * 7).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--tile)] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Order check</p>
            <div className="mt-4 space-y-3">
              {['Stop loss added', 'Setup tag selected', 'Daily loss within limit'].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs font-semibold text-[var(--text2)]">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--gain-bg)] text-[var(--gain)]"><Check size={12} /></span>
                  {item}
                </div>
              ))}
            </div>
            <button className="sf-btn-primary mt-5 h-9 w-full text-xs">BUY NIFTY 25000 CE</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  useHashScroll()

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
          <div>
            <div className="group inline-flex rounded-full bg-gradient-to-r from-[var(--primary)] via-fuchsia-500 to-amber-400 p-[1.5px] shadow-[0_12px_34px_-10px_var(--primary)] transition-transform duration-300 hover:scale-[1.03]">
              <span className="inline-flex items-center gap-2.5 rounded-full bg-[var(--color-surface)] px-3.5 py-1.5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-500" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text)] sm:text-xs">
                  Be proud to be in the
                </span>
                <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-xs font-black uppercase tracking-tight text-transparent drop-shadow-[0_1px_6px_rgba(245,158,11,0.35)] sm:text-sm">
                  Top 1%
                </span>
              </span>
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Virtual options trading simulator</p>
            <h1 className="sf-serif mt-5 max-w-3xl text-5xl font-bold leading-[1.03] text-[var(--text)] md:text-6xl">
              Practice options trading where bad habits get blocked before they cost you a rupee.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-sub)]">
              StrikeFluency helps Indian retail traders practice NIFTY, BANKNIFTY, and SENSEX options on a virtual desk that blocks revenge trades, no-SL entries, and overtrading — before you place the order, not after you've lost money.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={isAuthenticated ? '/dashboard' : '/register'} className="sf-btn-primary h-11 px-5">
                {isAuthenticated ? 'Open Dashboard' : 'Start free practice'}
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="sf-btn-outline h-11 px-5">Log in</Link>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-5 text-[var(--text-muted)]">
              StrikeFluency is a practice simulator only. No real money, no live broker execution, no SEBI-regulated advice — just a safe place to build trading discipline before you risk capital.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                ['Rs 1L+', 'virtual capital'],
                ['7', 'discipline rules'],
                ['3s', 'market broadcast cycle']
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
                  <div className="num text-xl font-bold text-[var(--text)]">{value}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <HeroMockup />
        </section>

        <section id="product" className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Product details</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A compact trading practice workspace, not a broker terminal.</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                The product is built for simulated execution, discipline training, journaling, and analytics. It is designed to help traders rehearse process quality before risking real capital.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={19} />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="rules" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Discipline scope</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Rules are part of the order flow, not an afterthought.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
              Every virtual order is checked before placement — the same way a disciplined trader would check themselves, except the system never lets it slide. These are the 7 leaks most retail traders don't realize are draining their account: revenge trades, no-SL entries, overtrading, impulsive direction flips, and more.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((rule, index) => (
              <div key={rule} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
                <span className="num grid h-8 w-8 place-items-center rounded-full bg-[var(--primary-bg)] text-xs font-bold text-[var(--primary)]">{index + 1}</span>
                <span className="text-sm font-semibold text-[var(--text)]">{rule}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="scope" className="border-y border-[var(--border)] bg-[var(--color-surface)] py-16 text-[var(--text)]">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Current project scope</p>
                <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">What you can practice with today.</h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                  The current application scope is Phase 1 virtual trading with mock market data by default, plus Fyers token and market-data integration paths for configured environments.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Instruments', 'NIFTY, BANKNIFTY, and SENSEX options with canonical lot sizes.'],
                  ['Execution', 'Virtual order placement, slippage, brokerage estimates, margin checks, close flow, and P&L updates.'],
                  ['Market data', 'Mock provider first; Fyers provider can be enabled through backend configuration and broker connection.'],
                  ['Data model', 'Every account, order, position, rule violation, and journal entry is tracked automatically — so nothing about your practice history gets lost.']
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface2)] p-5">
                    <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">How it works</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A simple loop for deliberate practice.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step.title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5">
                <div className="num mb-5 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">0{index + 1}</div>
                <h3 className="text-sm font-bold text-[var(--text)]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--color-surface2)] p-6 md:flex md:items-center md:justify-between md:p-8">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                <Lock size={14} /> Safe practice first
              </div>
              <h2 className="sf-serif text-3xl font-bold text-[var(--text)]">Ready to practice with rules before risk?</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                Start with a virtual account, build disciplined streaks, and use analytics to improve the trading process.
              </p>
            </div>
            <Link to={isAuthenticated ? '/dashboard' : '/register'} className="sf-btn-primary mt-6 h-11 px-5 md:mt-0">
              {isAuthenticated ? 'Open Dashboard' : 'Create account'}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
