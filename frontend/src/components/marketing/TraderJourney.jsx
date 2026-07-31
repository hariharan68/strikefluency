import { useEffect, useRef, useState } from 'react'
import { Award, Brain, Flame, ShieldCheck, TrendingDown } from 'lucide-react'

// Self-contained landing-page section: the five stages a trader moves through,
// laid out as a vertical journey whose spine fills as the section scrolls past.
// Drop it into any marketing page — it takes no props and imports nothing but
// icons. All colour comes from theme tokens, so it works in all four themes.

// Each stage carries its own accent token. The arc runs loss -> warn -> primary
// -> gain, so the colour itself tells the story before the copy is read.
const STAGES = [
  {
    icon: Flame,
    title: 'Illusion',
    quote: '“This looks easy.”',
    body: 'The first wins arrive fast and feel like skill. Size creeps up, stops feel optional, and every gut call looks like a read. Nothing has punished you yet, so nothing has taught you anything.',
    marks: ['Oversized positions', 'No stop-loss', 'Gut-feel entries'],
    accent: 'var(--loss)',
    accentBg: 'var(--loss-bg)',
  },
  {
    icon: TrendingDown,
    title: 'Despair',
    quote: '“I just need one good trade.”',
    body: 'The account bleeds and the behaviour turns defensive. You add to losers, flip direction out of frustration, and take the fourth trade after three losses — chasing back what the first mistake cost.',
    marks: ['Revenge trading', 'Averaging down', 'Overtrading'],
    accent: 'var(--loss)',
    accentBg: 'var(--loss-bg)',
  },
  {
    icon: Brain,
    title: 'Probability & Risk',
    quote: '“I cannot control the outcome — only the risk.”',
    body: 'The shift that changes everything. You stop trying to be right and start managing exposure. A loss stops being a verdict on you and becomes one sample in a distribution you have sized for.',
    marks: ['Position sizing', 'Defined R per trade', 'Thinking in samples'],
    feature: 'Mandatory stop-loss and the daily loss cap make this concrete — you cannot place a trade without naming your risk.',
    accent: 'var(--warn)',
    accentBg: 'var(--warn-bg)',
  },
  {
    icon: ShieldCheck,
    title: 'Discipline',
    quote: '“The rules are not stopping me. They are me.”',
    body: 'The guardrails stop feeling like restrictions. You take fewer trades and better ones, the streak holds through a losing week, and a red day no longer changes tomorrow’s behaviour.',
    marks: ['Rules followed under pressure', 'Streaks that survive losses', 'Plan over impulse'],
    feature: 'Your discipline score and streak track exactly this — measured over your last 20 trades, so it reflects who you are now.',
    accent: 'var(--primary)',
    accentBg: 'var(--primary-bg)',
  },
  {
    icon: Award,
    title: 'Mastery',
    quote: '“It got boring. That was the point.”',
    body: 'Execution becomes unremarkable. The process runs without argument, the journal turns each session into evidence, and results stop being something you chase and start being something that accumulates.',
    marks: ['Repeatable process', 'Reviewed, not remembered', 'Consistency over hero trades'],
    feature: 'The journal and analytics close the loop — every trade tagged, reviewed, and fed back into the next one.',
    accent: 'var(--gain)',
    accentBg: 'var(--gain-bg)',
  },
]

export default function TraderJourney() {
  const trackRef = useRef(null)
  const fillRef = useRef(null)
  const gradientRef = useRef(null)
  const stageRefs = useRef([])
  const revealedRef = useRef(STAGES.map(() => false))
  const [revealed, setRevealed] = useState(() => STAGES.map(() => false))

  // Respect the OS motion preference: render everything in its final state and
  // skip both the observer and the scroll listener entirely.
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )

  // One rAF-throttled measurement drives both effects: how far the spine has
  // filled, and which stages have been revealed.
  //
  // Deliberately geometry-based rather than IntersectionObserver. An observer
  // only fires when it samples an element as intersecting, so a fast scroll or
  // an anchor jump that carries a stage across the viewport within a single
  // frame never triggers it — leaving that stage stuck at opacity 0 forever.
  // Testing the rect each frame cannot miss it.
  //
  // The spine is written straight to the DOM rather than held in state. Putting
  // scroll progress in state would re-render on every frame, and since the
  // stage `ref` callbacks are re-created each render React detaches them
  // (passing null) in the process — so a measurement landing on the last frame
  // of a scroll could read null nodes and strand those stages hidden.
  useEffect(() => {
    const applyReveal = next => {
      revealedRef.current = next
      setRevealed(next)
    }

    if (reducedMotion) {
      if (fillRef.current) fillRef.current.style.height = '100%'
      applyReveal(STAGES.map(() => true))
      return undefined
    }

    let frame = 0
    const measure = () => {
      frame = 0
      const track = trackRef.current
      if (!track) return

      const { top, height } = track.getBoundingClientRect()
      // Anchored near the reveal line below, so the fill reaches a marker at
      // roughly the moment that stage fades in.
      const progress = Math.min(1, Math.max(0, (window.innerHeight * 0.8 - top) / height))
      if (fillRef.current) fillRef.current.style.height = `${progress * 100}%`
      // The gradient needs an explicit pixel height so it stays the full length
      // of the spine while its wrapper clips it.
      if (gradientRef.current) gradientRef.current.style.height = `${height}px`

      // Latch on, never off — scrolling back up must not replay the entrance.
      const revealLine = window.innerHeight * 0.88
      const current = revealedRef.current
      let changed = false
      const next = current.map((isOn, index) => {
        if (isOn) return true
        const node = stageRefs.current[index]
        if (!node || node.getBoundingClientRect().top > revealLine) return false
        changed = true
        return true
      })
      if (changed) applyReveal(next)
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reducedMotion])

  return (
    <section className="relative overflow-hidden border-y border-[var(--border)] bg-[var(--color-surface)] py-16 md:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(100% 90% at 15% 0%, rgba(var(--primary-glow-rgb),0.10) 0%, transparent 55%)' }}
      />

      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <header className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            The trader journey
          </p>
          <h2 className="sf-serif mt-3 text-3xl font-bold text-[var(--text)] md:text-4xl">
            Every trader walks the same five stages.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-sub)] md:text-base md:leading-8">
            Most people pay real money for the first two. The point of practising here is to walk them on
            simulated capital — and to have the rules carry you into the third before the second one empties
            an account.
          </p>
        </header>

        <div ref={trackRef} className="relative mt-12 md:mt-16">
          {/* The spine: a muted track with a coloured fill revealed by scroll
              progress. The fill is a full-height gradient inside a clipping
              wrapper, so scrolling uncovers the gradient rather than squashing
              it — the colour at any point always matches that stage. */}
          <div
            aria-hidden="true"
            className="absolute bottom-6 left-[15px] top-2 w-px bg-[var(--border)] sm:left-[19px] lg:left-[23px]"
          >
            <div
              ref={fillRef}
              className="absolute inset-x-0 top-0 overflow-hidden rounded-full"
              style={{ height: '0%', transition: reducedMotion ? 'none' : 'height 120ms linear' }}
            >
              <div
                ref={gradientRef}
                className="absolute inset-x-0 top-0 h-full"
                style={{ background: 'linear-gradient(180deg, var(--loss) 0%, var(--loss) 22%, var(--warn) 48%, var(--primary) 72%, var(--gain) 100%)' }}
              />
            </div>
          </div>

          <ol className="space-y-8 md:space-y-10">
            {STAGES.map((stage, index) => {
              const { icon: Icon } = stage
              const isRevealed = revealed[index]
              return (
                <li
                  key={stage.title}
                  data-stage={index}
                  ref={node => { stageRefs.current[index] = node }}
                  className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-4 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[48px_minmax(0,1fr)] lg:gap-8"
                  style={{
                    opacity: isRevealed ? 1 : 0,
                    transform: isRevealed ? 'none' : 'translateY(16px)',
                    // No per-stage stagger: stages sit a screenful apart and
                    // reveal one at a time, so a delay would only make a fast
                    // scroll look like the content is missing.
                    transition: reducedMotion
                      ? 'none'
                      : 'opacity 420ms cubic-bezier(0.16,1,0.3,1), transform 420ms cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                  {/* Marker */}
                  <div className="relative z-10 flex justify-center pt-1">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full border transition-transform duration-500 sm:h-10 sm:w-10 lg:h-12 lg:w-12"
                      style={{
                        borderColor: stage.accent,
                        background: stage.accentBg,
                        color: stage.accent,
                        transform: isRevealed ? 'scale(1)' : 'scale(0.8)',
                        boxShadow: isRevealed ? `0 0 0 4px ${stage.accentBg}` : 'none',
                      }}
                    >
                      <Icon size={16} className="lg:hidden" />
                      <Icon size={20} className="hidden lg:block" />
                    </span>
                  </div>

                  {/* Card — capped so body copy stays at a readable measure on
                      wide screens rather than running the full container. */}
                  <article className="group max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--color-surface2)] p-5 shadow-[var(--shadow)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--primary-border)] hover:shadow-[var(--shadow-md)] sm:p-6 lg:p-7">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        className="num text-[11px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: stage.accent }}
                      >
                        Stage {index + 1}
                      </span>
                      <span aria-hidden="true" className="hidden h-px w-6 bg-[var(--border)] sm:block" />
                      <h3 className="sf-serif text-xl font-bold text-[var(--text)] sm:text-2xl">
                        {stage.title}
                      </h3>
                    </div>

                    <p
                      className="mt-3 border-l-2 pl-3 text-sm font-semibold italic leading-6 text-[var(--text)] sm:text-base"
                      style={{ borderColor: stage.accent }}
                    >
                      {stage.quote}
                    </p>

                    <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">{stage.body}</p>

                    <ul className="mt-5 flex flex-wrap gap-2">
                      {stage.marks.map(mark => (
                        <li
                          key={mark}
                          className="rounded-full border border-[var(--border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]"
                        >
                          {mark}
                        </li>
                      ))}
                    </ul>

                    {stage.feature && (
                      <p
                        className="mt-5 rounded-xl px-4 py-3 text-[13px] leading-6 text-[var(--text-sub)]"
                        style={{ background: stage.accentBg }}
                      >
                        <span className="font-bold text-[var(--text)]">In StrikeFluency — </span>
                        {stage.feature}
                      </p>
                    )}
                  </article>
                </li>
              )
            })}
          </ol>
        </div>

        <p className="mt-12 max-w-2xl text-sm leading-7 text-[var(--text-sub)]">
          Nobody skips a stage. But you can choose what the first two cost you — a drawdown on a simulated
          account, or the real one.
        </p>
      </div>
    </section>
  )
}
