/**
 * Shared ECharts option builders.
 *
 * Every chart on the Advanced Dashboard used to re-specify its own grid, axes,
 * and tooltip, which is why they drifted apart (two different tooltip styles, an
 * axis with no domain, two panels whose plots did not line up). One source of
 * truth for the chrome; each chart supplies only its series.
 */
import { asNumber, compactMoney, dateLabel } from '../../utils/chartFormat'

const AXIS_FONT = 10
const LABEL_FONT = 10.5

/** Left inset must be identical across stacked grids or their plots won't align. */
export const GRID_LEFT = 64
export const GRID_RIGHT = 18

export const axisLabelStyle = tokens => ({
  color: tokens['text-muted'],
  fontSize: AXIS_FONT,
})

/**
 * A category x axis. Solid hairline ticks only — no dashed gridlines, which read
 * as a threshold when they are just chrome.
 */
export const categoryAxis = (tokens, categories, { gridIndex = 0, showLabels = true } = {}) => ({
  type: 'category',
  data: categories,
  gridIndex,
  boundaryGap: true,
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { show: false },
  axisLabel: {
    show: showLabels,
    ...axisLabelStyle(tokens),
    formatter: dateLabel,
    hideOverlap: true,
  },
  axisPointer: { label: { show: false } },
})

export const valueAxis = (tokens, { gridIndex = 0, formatter = compactMoney, ...rest } = {}) => ({
  type: 'value',
  gridIndex,
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { show: true, lineStyle: { color: tokens['border-light'], width: 1, type: 'solid' } },
  axisLabel: { ...axisLabelStyle(tokens), formatter },
  ...rest,
})

/**
 * Nice-rounded [min, max] for a value axis.
 *
 * `includeZero` is what stops a small positive bar from being crushed against
 * the plot edge when every other value is negative — the "Instrument
 * performance" defect. `padRatio` is for axes that should NOT start at zero
 * (equity), where the data range is the whole story.
 */
export const niceDomain = (values, { includeZero = true, padRatio = 0.08 } = {}) => {
  const numbers = values.map(asNumber).filter(Number.isFinite)
  if (!numbers.length) return { min: 0, max: 1 }

  let min = Math.min(...numbers)
  let max = Math.max(...numbers)
  if (includeZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  if (min === max) {
    // A single distinct value would otherwise collapse the axis to zero height.
    const bump = Math.abs(min) * 0.05 || 1
    return { min: min - bump, max: max + bump }
  }

  const pad = (max - min) * padRatio
  // On a zero-anchored axis, pad away from zero only: an all-negative series
  // padded symmetrically reserves half the plot for positive values that do not
  // exist, which is how "Instrument performance" got a +20K axis with no data
  // above zero. On a free axis (equity) both ends are real data and both need
  // room, or the series clips against its own bounds.
  const padLow = !includeZero || min < 0 ? pad : 0
  const padHigh = !includeZero || max > 0 ? pad : 0
  const step = niceStep((max - min + padLow + padHigh) / 4)
  return {
    min: Math.floor((min - padLow) / step) * step,
    max: Math.ceil((max + padHigh) / step) * step,
  }
}

const niceStep = raw => {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const snapped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return snapped * magnitude
}

/**
 * Two vertically stacked grids sharing one x axis.
 *
 * This is the fix for both multi-panel charts. Previously they were two separate
 * ResponsiveContainers where only the top one reserved y-axis width, so the
 * plots started ~78px apart; and it made a linked crosshair impossible.
 */
export const stackedGrids = ({ topHeight = '54%', bottomTop = '70%', top = 14, bottom = 28 } = {}) => ([
  { left: GRID_LEFT, right: GRID_RIGHT, top, height: topHeight },
  { left: GRID_LEFT, right: GRID_RIGHT, top: bottomTop, bottom },
])

/** One crosshair driving every stacked grid at once. */
export const linkedAxisPointer = tokens => ({
  link: [{ xAxisIndex: 'all' }],
  lineStyle: { color: tokens.border, width: 1, type: 'solid' },
})

/**
 * The single tooltip treatment. Replaces the old split between a TOOLTIP_STYLE
 * object on two charts and a bespoke React component on the other four.
 */
export const tooltip = (tokens, { formatter, trigger = 'axis' } = {}) => ({
  trigger,
  confine: true,
  appendToBody: true,
  backgroundColor: tokens['color-surface'],
  borderColor: tokens.border,
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: tokens.text, fontSize: 11.5 },
  extraCssText: 'border-radius:10px;box-shadow:0 10px 30px -12px rgba(0,0,0,0.35);backdrop-filter:blur(6px);',
  axisPointer: trigger === 'axis'
    ? { type: 'line', lineStyle: { color: tokens.border, width: 1 } }
    : undefined,
  formatter,
})

// ECharts injects a formatter's return value as raw innerHTML — it does NOT
// escape it the way React would. Any label/value here can carry user-authored
// free text (e.g. a trade's setup_tag), so every interpolated string must be
// HTML-escaped or a crafted tag becomes script execution in the tooltip.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
))

/** Tooltip body shared by the charts: a dim title over colour-chipped rows. */
export const tooltipHtml = (tokens, title, rows) => {
  const head = `<div style="color:${tokens['text-muted']};font-size:10.5px;margin-bottom:5px">${escapeHtml(title)}</div>`
  const body = rows.map(row => `
    <div style="display:flex;align-items:center;gap:7px;line-height:1.7">
      ${row.color ? `<i style="width:8px;height:8px;border-radius:2px;background:${row.color};flex:none"></i>` : ''}
      <span style="color:${tokens['text-sub']};font-size:11px">${escapeHtml(row.label)}</span>
      <strong style="margin-left:auto;font-variant-numeric:tabular-nums;color:${row.tone || tokens.text}">${escapeHtml(row.value)}</strong>
    </div>`).join('')
  return head + body
}

/** Bar corner radii, always rounded on the data end and square on the baseline. */
export const barRadius = (value, horizontal = false) => {
  const positive = asNumber(value) >= 0
  if (horizontal) return positive ? [0, 4, 4, 0] : [4, 0, 0, 4]
  return positive ? [4, 4, 0, 0] : [0, 0, 4, 4]
}

export const pnlColor = (value, tokens) => (asNumber(value) >= 0 ? tokens.gain : tokens.loss)

/** Vertical gradient for an area fill, from a solid token down to near-transparent. */
export const areaGradient = (color, from = 0.26, to = 0.02) => ({
  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [
    { offset: 0, color: withAlpha(color, from) },
    { offset: 1, color: withAlpha(color, to) },
  ],
})

/** Alpha-blend a token value, handling #rgb, #rrggbb, and rgb()/rgba() forms. */
export function withAlpha(color, alpha) {
  const value = String(color || '').trim()
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.slice(0, 6)
    const int = parseInt(full, 16)
    if (Number.isNaN(int)) return value
    return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (match) {
    const [r, g, b] = match[1].split(',').map(part => part.trim())
    return `rgba(${r},${g},${b},${alpha})`
  }
  return value
}
