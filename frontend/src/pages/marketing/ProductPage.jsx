import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, BarChart3, BookOpen, Database, ShieldCheck, Target
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const features = [
  {
    icon: Activity,
    title: 'Virtual options trading desk',
    text: 'Practice NIFTY, BANKNIFTY, and SENSEX CE/PE orders with option-chain prices, lots, stop-loss, targets, and open-position tracking.',
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
    icon: Database,
    title: 'Mock-first, Fyers-ready market data',
    text: 'Run safely in mock mode by default, or connect Fyers credentials for live market-data workflows when configured.',
  },
  {
    icon: Target,
    title: 'Capital tiers and streaks',
    text: 'Start with virtual capital and use disciplined trade streaks to unlock higher simulation tiers over time.',
  },
]

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface2)]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Product</p>
            <h1 className="sf-serif mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-5xl">
              A compact trading practice workspace, not a broker terminal.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-sub)]">
              The product is built for simulated execution, discipline training, journaling, and analytics. It is designed to help traders rehearse process quality before risking real capital.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface2)] py-14">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-5 px-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">See it in action</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">Open a free virtual account and place your first rule-checked trade.</p>
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
