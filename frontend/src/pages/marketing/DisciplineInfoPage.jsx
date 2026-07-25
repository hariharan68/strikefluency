import { Link } from 'react-router-dom'
import {
  ArrowRight, ShieldCheck, Gauge, Lock, Ban, Repeat, Clock, AlertTriangle,
  Tag, Quote, ToggleRight, Sliders, Check, Flame, TrendingUp, ClipboardCheck,
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const stats = [
  { value: '7', label: 'Rules enforced' },
  { value: '100%', label: 'Orders checked before placement' },
  { value: '₹0', label: 'Free, forever' },
  { value: '1:1', label: 'Every violation logged' },
]

const flow = [
  { icon: ClipboardCheck, title: 'You submit an order', text: 'Build a trade on the desk or from the strategy builder with real option-chain pricing.' },
  { icon: ShieldCheck, title: 'The engine runs seven checks', text: 'Each rule is validated in a single pre-trade pass before anything is accepted.' },
  { icon: AlertTriangle, title: 'Accepted — or blocked and logged', text: 'A clean order fills; a rule-breaking one is refused and recorded as a violation you can review.' },
]

const rules = [
  { icon: Gauge, name: 'Max trades per day', text: 'Caps overtrading — the fastest way to give back gains. An order beyond the limit is blocked.' },
  { icon: Lock, name: 'Mandatory stop-loss', text: 'Every entry must carry a stop. No SL, no fill — no exceptions, no hoping.' },
  { icon: Ban, name: 'No averaging down', text: 'Adding to a losing position turns small losses into blow-ups, so it is refused.' },
  { icon: Repeat, name: 'No direction flip', text: 'Flipping long to short mid-session is usually tilt, not analysis, so the engine stops it.' },
  { icon: Clock, name: 'Revenge cooldown', text: 'After a stop-out, a short lockout forces a pause before you retaliate with another trade.' },
  { icon: AlertTriangle, name: 'Daily loss cap', text: 'Once the day’s loss limit is hit, trading stops — so a bad day cannot become a bad week.' },
  { icon: Tag, name: 'Mandatory setup tag', text: 'If you cannot name the setup behind a trade, you should not be taking it.' },
]

const leaks = [
  'Revenge trading right after a loss',
  'Placing orders with no stop-loss',
  'Overtrading far past your daily plan',
  'Averaging down into a losing position',
  'Impulsive long-to-short direction flips',
  'Taking trades with no defined setup',
]

export default function DisciplineInfoPage() {
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
              <ShieldCheck size={13} /> Discipline engine
            </span>
            <h1 className="sf-serif mt-5 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-6xl">
              Rules are part of the order flow, not an afterthought.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-sub)] md:text-lg">
              Every virtual order is checked before it is placed. The goal is to block the common behavior
              leaks — revenge trades, no-stop entries, overtrading, and impulsive direction flips — before they
              ever cost you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="sf-btn-primary h-11 px-5">
                Start free practice <ArrowRight size={16} />
              </Link>
              <a href="#rules" className="sf-btn-outline h-11 px-5">
                See the seven rules
              </a>
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

        {/* Motivational quote band */}
        <section className="relative overflow-hidden bg-[var(--primary)] py-16 md:py-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: 'radial-gradient(90% 120% at 50% -20%, rgba(255,255,255,0.18) 0%, transparent 60%)' }}
          />
          <div className="relative mx-auto max-w-4xl px-5 text-center md:px-8">
            <Quote size={34} className="mx-auto text-[var(--on-primary)] opacity-70" />
            <p className="sf-serif mt-5 text-3xl font-bold leading-tight text-[var(--on-primary)] md:text-5xl">
              Trust the process.
              <br className="hidden sm:block" />{' '}
              <span className="opacity-80">The process is the progress.</span>
            </p>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-[var(--on-primary)] opacity-80">
              Outcomes are noisy and often lucky. Process is the one thing you control — so we make good process
              the habit and let the results follow.
            </p>
          </div>
        </section>

        {/* How the check works */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">How the check works</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">One pre-trade pass, before every order</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              The engine sits between your intent and the fill. Nothing reaches your positions until it has passed
              the rulebook.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {flow.map(({ icon: Icon, title, text }, i) => (
              <article key={title} className="relative rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                <span className="absolute right-5 top-5 sf-serif text-2xl font-bold text-[var(--color-border2)] opacity-70">0{i + 1}</span>
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* The seven rules */}
        <section id="rules" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">The rulebook</p>
              <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Seven rules that run before every order</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                Each rule targets a specific way traders leak money. Break one, and the trade is stopped with a
                reason you can learn from.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rules.map(({ icon: Icon, name, text }, index) => (
                <article key={name} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                      <Icon size={18} />
                    </span>
                    <span className="num text-xs font-bold text-[var(--text-muted)]">Rule {index + 1}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[var(--text)]">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </article>
              ))}
              <article className="flex flex-col justify-center rounded-2xl border border-[var(--primary-border)] bg-[var(--primary-bg)] p-6">
                <Sliders size={22} className="text-[var(--primary)]" />
                <h3 className="mt-3 text-base font-bold text-[var(--text)]">Every rule is yours to tune</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
                  Set each limit to your own plan in Settings. The engine enforces whatever rulebook you define — not a
                  one-size-fits-all default.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Discipline Mode master switch */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Discipline mode</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">One master switch, two ways to practice</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
              You are always in control. Keep the guardrails on to build real habits, or flip to free play when you
              just want to explore.
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--primary-border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary-bg)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                <ShieldCheck size={14} /> Guardrails ON
              </div>
              <h3 className="text-lg font-bold text-[var(--text)]">Disciplined mode</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">
                All seven rules are enforced and your disciplined capital is at stake. Every trade counts toward your
                discipline score, streaks, and tier progression — this is how you build the habit.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow)]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-surface2)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]">
                <ToggleRight size={14} /> Free play OFF
              </div>
              <h3 className="text-lg font-bold text-[var(--text)]">Free-play mode</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">
                Flip the master switch to bypass the rules and unlock ₹10L to experiment freely. Those trades are
                flagged as free play and excluded from your discipline score, so exploration never pollutes your real
                progress.
              </p>
            </div>
          </div>
        </section>

        {/* What it prevents */}
        <section className="border-y border-[var(--border)] bg-[var(--color-surface2)] py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Why it matters</p>
                <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">The leaks it plugs</h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">
                  Most accounts are not lost to bad analysis — they are lost to repeated behavior mistakes. The engine
                  catches them at the exact moment they happen, so the habit never forms.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {leaks.map((leak) => (
                  <li key={leak} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm leading-6 text-[var(--text-sub)] shadow-[var(--shadow)]">
                    <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[var(--primary-bg)] text-[var(--primary)]">
                      <Check size={13} />
                    </span>
                    {leak}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Discipline score & streaks */}
        <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Measured progress</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Discipline you can actually see grow</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--text)]">Discipline score</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
                A single, honest number that tracks how closely you followed your own rules — free-play trades are
                excluded so it stays true.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                <Flame size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--text)]">Streaks</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
                Stack rule-clean sessions into a streak. Consistency, not a single big win, is what the app rewards.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                <TrendingUp size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--text)]">Capital tiers</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
                Disciplined streaks unlock higher simulation tiers over time, so more capital is something you earn — not
                a slider you drag.
              </p>
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
                    <ShieldCheck size={14} /> Practice with rules before risk
                  </div>
                  <h2 className="sf-serif text-2xl font-bold text-[var(--text)] md:text-3xl">Build disciplined streaks on a virtual account.</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">
                    Free, forever. Trust the process — and let the process become your progress.
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-3">
                  <Link to="/register" className="sf-btn-primary h-11 px-5">
                    Create free account <ArrowRight size={16} />
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
