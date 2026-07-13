import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Tag } from 'lucide-react'
import { LandingNav, SiteFooter } from '../../components/marketing/SiteChrome'

const featured = {
  tag: 'Trading Psychology',
  title: 'Why undisciplined traders blow up — and how paper trading rewires the habit',
  excerpt: 'Overtrading, revenge trades, and no-stop entries are not knowledge gaps — they are behavior leaks. Here is how deliberate, rule-checked practice fixes the loop before real money is on the line.',
  author: 'StrikeFluency Team',
  date: 'Jul 10, 2026',
  read: '8 min read',
}

const posts = [
  {
    tag: 'Discipline',
    title: 'The daily loss cap: your single most important rule',
    excerpt: 'A hard stop on the day protects tomorrow. We break down how to size it and why 2% is a sensible default.',
    date: 'Jul 8, 2026', read: '5 min read',
  },
  {
    tag: 'Options',
    title: 'Reading the option chain like a process, not a lottery',
    excerpt: 'OI, LTP, and strikes tell a story. A repeatable way to scan the chain before you ever think about an entry.',
    date: 'Jul 5, 2026', read: '6 min read',
  },
  {
    tag: 'Journaling',
    title: 'Emotion tags: the data most traders never collect',
    excerpt: 'Confident, fearful, greedy, FOMO — tagging the emotion behind each trade is where the real edge hides.',
    date: 'Jul 2, 2026', read: '4 min read',
  },
  {
    tag: 'Risk',
    title: 'Position sizing for a virtual account (that transfers to real one)',
    excerpt: 'How to practice sizing so the habit survives the jump from simulation to live capital.',
    date: 'Jun 28, 2026', read: '7 min read',
  },
  {
    tag: 'Product',
    title: 'How the discipline engine blocks an order in real time',
    excerpt: 'A look under the hood at the seven rules that run before every simulated order is accepted.',
    date: 'Jun 24, 2026', read: '5 min read',
  },
  {
    tag: 'Mindset',
    title: 'Streaks over P&L: measuring the right thing',
    excerpt: 'Why your discipline streak is a better scoreboard than your daily green or red number.',
    date: 'Jun 20, 2026', read: '4 min read',
  },
]

const tags = ['All', 'Discipline', 'Options', 'Risk', 'Journaling', 'Psychology', 'Product']

function TagBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
      <Tag size={11} /> {children}
    </span>
  )
}

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <LandingNav />
      <main>
        {/* Hero */}
        <section className="border-b border-[var(--border)] bg-[var(--color-surface2)]">
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">The StrikeFluency Blog</p>
            <h1 className="sf-serif mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-[var(--text)] md:text-5xl">
              Notes on discipline, options, and deliberate practice.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-sub)]">
              Practical writing for retail traders who want to fix the behavior behind the P&L — not chase the next tip.
            </p>
          </div>
        </section>

        {/* Featured */}
        <section className="mx-auto max-w-7xl px-5 pt-14 md:px-8">
          <a href="#" className="group grid gap-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--color-surface)] shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-md)] lg:grid-cols-[1.1fr_0.9fr]">
            <div className="min-h-[220px] bg-gradient-to-br from-[#0B1437] to-[#1E3A6A] p-8">
              <TagBadge>{featured.tag}</TagBadge>
              <h2 className="sf-serif mt-5 text-2xl font-bold leading-snug text-white md:text-3xl">{featured.title}</h2>
            </div>
            <div className="p-8">
              <p className="text-sm leading-7 text-[var(--text-sub)]">{featured.excerpt}</p>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text)]">{featured.author}</span>
                <span>{featured.date}</span>
                <span className="inline-flex items-center gap-1.5"><Clock size={13} /> {featured.read}</span>
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
                Read article <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </a>
        </section>

        {/* Tag filter */}
        <section className="mx-auto max-w-7xl px-5 pt-12 md:px-8">
          <div className="flex flex-wrap gap-2">
            {tags.map((t, i) => (
              <button
                key={t}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  i === 0
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                    : 'border-[var(--border)] bg-[var(--color-surface)] text-[var(--text-sub)] hover:border-[var(--primary-border)] hover:text-[var(--primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Post grid */}
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <a key={post.title} href="#" className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)]">
                <TagBadge>{post.tag}</TagBadge>
                <h3 className="mt-4 text-base font-bold leading-snug text-[var(--text)] group-hover:text-[var(--primary)]">{post.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-sub)]">{post.excerpt}</p>
                <div className="mt-5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>{post.date}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock size={12} /> {post.read}</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--color-surface2)] p-8 text-center">
            <h2 className="sf-serif text-2xl font-bold text-[var(--text)]">Get new posts in your inbox</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-sub)]">
              Occasional, practical writing on discipline and options. No spam, no tips, unsubscribe anytime.
            </p>
            <form className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-full border border-[var(--border)] bg-[var(--color-surface)] px-5 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
              />
              <button type="submit" className="sf-btn-primary h-11 flex-shrink-0 px-6">Subscribe</button>
            </form>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
