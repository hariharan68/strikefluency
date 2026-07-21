import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, Sparkles, Heart, ShieldCheck, CreditCard, Infinity as InfinityIcon,
  Activity, Layers, BookOpen, BarChart3, Database, Wallet,
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const included = [
  { icon: Activity, label: 'Virtual options trading desk' },
  { icon: ShieldCheck, label: 'Discipline engine (all 7 rules)' },
  { icon: Layers, label: 'Multi-leg strategy builder' },
  { icon: BookOpen, label: 'Automatic trade journal' },
  { icon: BarChart3, label: 'Full process analytics' },
  { icon: Wallet, label: 'Capital tiers & streaks' },
  { icon: Database, label: 'Mock-first, Fyers-ready data' },
  { icon: InfinityIcon, label: 'Unlimited practice sessions' },
]

const reasons = [
  {
    icon: Heart,
    title: 'Built to help, not to upsell',
    text: 'StrikeFluency exists to help Indian retail traders build discipline before risking real money. Charging for that would defeat the point.',
  },
  {
    icon: ShieldCheck,
    title: 'No paywalls on discipline',
    text: 'The features that protect you — rules, journaling, analytics — are exactly the ones a paywall would gate. So none of them are gated.',
  },
  {
    icon: CreditCard,
    title: 'No card, no catch',
    text: 'There is no trial timer, no “premium” tier hidden behind a checkout, and no credit card required to use everything.',
  },
]

const faqs = [
  {
    q: 'Is it really free?',
    a: 'Yes — every feature is free with no time limit. You do not pay to place virtual trades, use the discipline engine, journal, or view analytics.',
  },
  {
    q: 'Do I need to enter a card?',
    a: 'No. Creating an account takes an email and password. There is no card field anywhere in signup or usage.',
  },
  {
    q: 'Will you add paid plans later?',
    a: 'The current build is 100% free and there are no paid tiers planned. If that ever changed, everything you rely on today would stay free — you would never lose access to what you already use.',
  },
  {
    q: 'What’s the catch?',
    a: 'There isn’t one. It is a practice environment, not a broker — there are no real-money orders, no advisory, and nothing to sell you.',
  },
  {
    q: 'Do I need a broker account?',
    a: 'No. The mock data provider works out of the box. Connecting Fyers is optional and only needed for live market-data workflows in configured environments.',
  },
]

export default function PricingPage() {
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
          <div className="relative mx-auto max-w-7xl px-5 py-16 text-center md:px-8 md:py-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-bg)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
              <Sparkles size={13} /> Pricing
            </span>
            <h1 className="sf-serif mx-auto mt-5 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-6xl">
              Everything. Free. Forever.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[var(--text-sub)] md:text-lg">
              StrikeFluency has one plan, and it costs nothing. Every feature — the discipline engine, strategy builder,
              journal, and analytics — is included at no cost, with no card and no catch.
            </p>
          </div>
        </section>

        {/* The one plan */}
        <section className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
          <div
            className="relative overflow-hidden rounded-3xl border border-[var(--primary-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)] md:p-10"
            style={{ background: 'radial-gradient(120% 120% at 90% -10%, rgba(var(--primary-glow-rgb),0.12) 0%, var(--color-surface) 55%)' }}
          >
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                  <Heart size={13} /> Free plan
                </span>
                <h2 className="sf-serif mt-4 text-2xl font-bold text-[var(--text)]">The only plan you’ll ever need</h2>
              </div>
              <div className="text-right">
                <div className="flex items-end gap-1">
                  <span className="sf-serif text-5xl font-bold text-[var(--text)]">₹0</span>
                  <span className="mb-1.5 text-sm font-semibold text-[var(--text-muted)]">/ forever</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">No card required</p>
              </div>
            </div>

            <div className="my-7 h-px w-full bg-[var(--border)]" />

            <ul className="grid gap-3 sm:grid-cols-2">
              {included.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm font-medium text-[var(--text-sub)]">
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Check size={13} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon size={15} className="text-[var(--text-muted)]" />
                    {label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="sf-btn-primary h-12 flex-1 text-sm">
                Start free — no card <ArrowRight size={16} />
              </Link>
              <Link to="/product" className="sf-btn-outline h-12 flex-1 text-sm">
                See what’s included
              </Link>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            No trials, no tiers, no upsells — just one free account with everything unlocked.
          </p>
        </section>

        {/* Why it's free */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Why it’s free</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">A practice tool shouldn’t cost you</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                The whole point is to build good habits before real money is on the line. Putting a price on that would
                get in the way.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {reasons.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                  <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Questions</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Pricing, answered plainly</h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow)] [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-bold text-[var(--text)]">
                  {q}
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[var(--primary-bg)] text-[var(--primary)] transition group-open:rotate-45">
                    <ArrowRight size={13} className="rotate-[-45deg]" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div
              className="relative overflow-hidden rounded-3xl border border-[var(--primary-border)] bg-[var(--color-surface2)] p-8 text-center md:p-12"
              style={{ background: 'radial-gradient(120% 140% at 50% 0%, rgba(var(--primary-glow-rgb),0.14) 0%, var(--color-surface2) 55%)' }}
            >
              <div className="mx-auto max-w-xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                  <Wallet size={14} /> ₹0 to start
                </div>
                <h2 className="sf-serif text-2xl font-bold text-[var(--text)] md:text-3xl">Nothing to buy. Everything to practice.</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                  Create a free virtual account and place your first rule-checked trade today.
                </p>
                <Link to="/register" className="sf-btn-primary mt-6 h-12 px-6 text-sm">
                  Start free practice <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
