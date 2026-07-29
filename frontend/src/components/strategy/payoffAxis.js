const TICK_COUNTS_BY_ZOOM = {
  1: 8,
  2: 6,
  4: 4,
}

/**
 * Build a clean, strike-aligned display axis without changing the wider payoff
 * curve returned by the backend. NIFTY's 50-point strike step produces
 * 200-point labels; 100-point instruments produce 400-point labels.
 */
export function buildPayoffPriceAxis({ spot, strikeStep, zoom = 1 }) {
  const step = Math.max(1, Number(strikeStep) || 50)
  const tickGap = step * 4
  const tickCount = TICK_COUNTS_BY_ZOOM[zoom] || TICK_COUNTS_BY_ZOOM[1]
  const anchor = Math.round(Number(spot || 0) / tickGap) * tickGap
  const lowerIntervals = Math.ceil((tickCount - 1) / 2)
  const firstTick = Math.max(tickGap, anchor - lowerIntervals * tickGap)
  const ticks = Array.from({ length: tickCount }, (_, index) => firstTick + index * tickGap)

  return {
    domain: [ticks[0], ticks.at(-1)],
    tickGap,
    ticks,
  }
}
