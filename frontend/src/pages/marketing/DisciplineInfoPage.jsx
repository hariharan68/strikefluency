import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const rules = [
  { name: 'Max trades per day', text: 'Caps overtrading — the fastest way to give back gains. An order beyond the limit is blocked.' },
  { name: 'Mandatory stop-loss', text: 'Every entry must carry a stop. No SL, no fill — no exceptions, no hoping.' },
  { name: 'No averaging down', text: 'Adding to a losing position turns small losses into blow-ups, so it is refused.' },
  { name: 'No direction flip', text: 'Flipping long to short mid-session is usually tilt, not analysis. The engine stops it.' },
  { name: 'Revenge cooldown', text: 'After a stop-out, a short lockout forces a pause before you retaliate with another trade.' },
  { name: 'Daily loss cap', text: 'Once the day’s loss limit is hit, trading stops — so a bad day cannot become a bad week.' },
  { name: 'Mandatory setup tag', text: 'If you cannot name the setup behind a trade, you should not be taking it.' },
]

export default function DisciplineInfoPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface2)]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Discipline engine</p>
            <h1 className="sf-serif mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-5xl">
              Rules are part of the order flow, not an afterthought.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-sub)]">
              Every virtual order is checked before placement. The goal is to block common behavior leaks such as revenge trades, no-SL entries, overtrading, and impulsive direction flips.
            </p>
          </div>
        </section>

        {/* Rules */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule, index) => (
              <article key={rule.name} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                <div className="flex items-center gap-3">
                  <span className="num grid h-8 w-8 place-items-center rounded-full bg-[var(--primary-bg)] text-xs font-bold text-[var(--primary)]">{index + 1}</span>
                  <h3 className="text-sm font-bold text-[var(--text)]">{rule.name}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">{rule.text}</p>
              </article>
            ))}
            <article className="flex flex-col justify-center rounded-2xl border border-[var(--primary-border)] bg-[var(--primary-bg)] p-6">
              <ShieldCheck size={22} className="text-[var(--primary)]" />
              <h3 className="mt-3 text-sm font-bold text-[var(--text)]">Every rule is editable</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Tune each limit to your own plan in Settings. The engine enforces whatever rulebook you set.</p>
            </article>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface2)] py-14">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-5 px-5 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">Practice with rules before risk</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">Build disciplined streaks on a virtual account — free, forever.</p>
            </div>
            <Link to="/register" className="sf-btn-primary h-11 flex-shrink-0 px-5">
              Create account <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
