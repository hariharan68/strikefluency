import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const scopeItems = [
  ['Instruments', 'NIFTY, BANKNIFTY, and SENSEX options with canonical lot sizes.'],
  ['Execution', 'Virtual order placement, slippage, brokerage estimates, margin checks, close flow, and P&L updates.'],
  ['Market data', 'Mock provider first; Fyers provider can be enabled through backend configuration and broker connection.'],
  ['Data model', 'JWT auth, virtual accounts, orders, positions, sessions, rules, violations, journal, and analytics.'],
]

const steps = [
  {
    title: 'Create your virtual account',
    text: 'Register, receive a simulated trading account, and start from a controlled capital tier.',
  },
  {
    title: 'Practice inside the option-chain desk',
    text: 'Select an index, inspect strikes, prefill orders, add SL and setup tags, then submit only if rules pass.',
  },
  {
    title: 'Review every result',
    text: 'Close positions, journal the trade, inspect violations, and use analytics to refine your process.',
  },
]

export default function ScopePage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface)] text-[var(--text)]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#93C5FD]">Current project scope</p>
            <h1 className="sf-serif mt-4 max-w-3xl text-4xl font-bold leading-[1.05] md:text-5xl">
              What StrikeFluency is built to do now.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#B8CDEE]">
              The current application scope is Phase 1 virtual trading with mock market data by default, plus Fyers token and market-data integration paths for configured environments.
            </p>
          </div>
        </section>

        {/* Scope cards */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {scopeItems.map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works — the deliberate-practice loop */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A simple loop for deliberate practice.</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                Three repeatable steps: set up, practice under rules, and review the evidence. Run the loop enough times and the process becomes a habit.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <article key={step.title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                  <div className="num mb-5 grid h-11 w-11 place-items-center rounded-xl text-sm font-bold text-[#131313]" style={{ background: 'var(--accent-gradient)' }}>0{index + 1}</div>
                  <h3 className="text-base font-bold text-[var(--text)]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--color-bg)] py-14">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-5 px-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">Try the current build</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">Everything above runs today on a free virtual account.</p>
            </div>
            <Link to="/register" className="sf-btn-primary h-11 flex-shrink-0 px-5">
              Start free practice <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
