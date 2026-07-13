import { Link } from 'react-router-dom'
import {
  ArrowRight, GraduationCap, Layers, ShieldCheck, Scale,
  Brain, LineChart, BookOpen, PlayCircle, Award
} from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const modules = [
  {
    icon: Layers, level: 'Beginner', chapters: 8,
    title: 'Options foundations',
    text: 'Calls, puts, premium, expiry, moneyness, and lot sizes for NIFTY, BANKNIFTY, and SENSEX.',
  },
  {
    icon: LineChart, level: 'Beginner', chapters: 6,
    title: 'Reading the option chain',
    text: 'OI, LTP, strikes, and how to scan the chain as a repeatable process instead of a guess.',
  },
  {
    icon: ShieldCheck, level: 'Core', chapters: 7,
    title: 'The discipline system',
    text: 'The seven rules, why each exists, and how they run before every order to stop behavior leaks.',
  },
  {
    icon: Scale, level: 'Core', chapters: 5,
    title: 'Risk & position sizing',
    text: 'Daily loss caps, per-trade risk, and sizing that survives the jump from virtual to real capital.',
  },
  {
    icon: Brain, level: 'Advanced', chapters: 6,
    title: 'Trading psychology',
    text: 'Revenge trading, FOMO, and tilt — spotting the emotion behind the click and building the pause.',
  },
  {
    icon: BookOpen, level: 'Advanced', chapters: 5,
    title: 'Journaling & review',
    text: 'Turning closed trades into evidence: emotion tags, mistake categories, and weekly review loops.',
  },
]

const levelStyles = {
  Beginner: 'bg-[var(--gain-bg)] text-[var(--gain-text)]',
  Core: 'bg-[var(--primary-bg)] text-[var(--primary)]',
  Advanced: 'bg-[var(--warn-bg)] text-[var(--warn)]',
}

const perks = [
  { icon: PlayCircle, title: 'Learn then do', text: 'Each chapter links straight into the virtual desk so you practice the concept immediately.' },
  { icon: Award, title: 'Discipline-first', text: 'Every module is framed around process quality, not tips or predictions.' },
  { icon: GraduationCap, title: 'Free, always', text: 'The entire curriculum is free — no paywalls, no upsells, no real money required.' },
]

export default function VarsityPage() {
  const totalChapters = modules.reduce((n, m) => n + m.chapters, 0)
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface)] text-[var(--text)]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#93C5FD]">
                <GraduationCap size={14} /> Strike Varsity
              </span>
              <h1 className="sf-serif mt-5 max-w-2xl text-4xl font-bold leading-[1.05] md:text-5xl">
                Learn to trade options with discipline — for free.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#B8CDEE]">
                A structured curriculum that takes you from option basics to a repeatable, rule-checked process. Read a chapter, then practice it in the virtual desk the same day.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/register" className="sf-btn-primary h-11 px-5">
                  Start learning free <ArrowRight size={16} />
                </Link>
                <a href="#modules" className="sf-btn-outline h-11 border-white/20 bg-white/5 px-5 text-white hover:bg-white/10">
                  Browse modules
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-6 text-sm text-[#B8CDEE]">
                <span><strong className="num text-white">{modules.length}</strong> modules</span>
                <span><strong className="num text-white">{totalChapters}</strong> chapters</span>
                <span><strong className="num text-white">100%</strong> free</span>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#93C5FD]">Your path</p>
              <div className="mt-5 space-y-3">
                {['Options foundations', 'The discipline system', 'Risk & position sizing', 'Trading psychology'].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <span className="num grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">0{i + 1}</span>
                    <span className="text-sm font-semibold text-white">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="mx-auto max-w-7xl px-5 py-16 md:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Curriculum</p>
            <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)]">Six modules, one disciplined process.</h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map(({ icon: Icon, level, chapters, title, text }) => (
              <article key={title} className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={20} />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${levelStyles[level]}`}>{level}</span>
                </div>
                <h3 className="mt-4 text-base font-bold text-[var(--text)]">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{chapters} chapters</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">
                    Start <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Perks */}
        <section className="border-t border-[var(--border)] bg-[var(--color-surface2)] py-16">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="grid gap-4 md:grid-cols-3">
              {perks.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
                    <Icon size={19} />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow)]">
              <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">Ready to turn theory into a habit?</h2>
              <p className="max-w-xl text-sm leading-7 text-[var(--text-sub)]">
                Open a free virtual account, read a chapter, and place your first rule-checked trade today.
              </p>
              <Link to="/register" className="sf-btn-primary h-11 px-6">
                Create free account <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
