/**
 * The Advanced Dashboard's charts.
 *
 * All of them share the chrome in chartOptions.js; each component below supplies
 * only its series and the axis decisions specific to it.
 */
import { useMemo } from 'react'
import { Activity, BarChart3, Scale, ShieldCheck, Target, TrendingUp } from 'lucide-react'
import EChart from './EChart'
import useChartTokens from './chartTheme'
import {
  areaGradient, barRadius, categoryAxis, GRID_LEFT, GRID_RIGHT, linkedAxisPointer,
  niceDomain, pnlColor, stackedGrids, tooltip, tooltipHtml, valueAxis, withAlpha,
} from './chartOptions'
import {
  asNumber, compactMoney, dateLabel, percentLabel, signedCompactMoney, signedMoney,
} from '../../utils/chartFormat'

function EmptyChart({ icon: Icon = BarChart3, title, description }) {
  return (
    <div className="advanced-empty-chart">
      <span><Icon size={20} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

/* ── 1. Portfolio equity + drawdown ──────────────────────────────────────────
 * One instance, two grids with identical left/right insets so the panels line
 * up, and a linked axis pointer so one hover reads both.
 */
export function PerformanceChart({ data, source }) {
  const tokens = useChartTokens()
  const seriesName = source === 'portfolio_snapshots' ? 'EOD equity' : 'Realized equity proxy'

  const option = useMemo(() => {
    if (!data.length) return null
    const dates = data.map(point => point.date)
    const equity = data.map(point => asNumber(point.equity))
    const drawdown = data.map(point => asNumber(point.drawdown))
    const start = equity[0]

    // padRatio with includeZero:false is the whole fix for the flat line: equity
    // moving 9.87L->10L was being drawn against a 0->10L axis.
    const equityDomain = niceDomain(equity.concat(start), { includeZero: false, padRatio: 0.18 })
    const drawdownFloor = Math.min(...drawdown, 0)

    return {
      animationDuration: 420,
      grid: stackedGrids({ topHeight: '52%', bottomTop: '70%' }),
      axisPointer: linkedAxisPointer(tokens),
      tooltip: tooltip(tokens, {
        formatter: params => {
          const first = Array.isArray(params) ? params[0] : params
          const rows = (Array.isArray(params) ? params : [params]).map(item => ({
            color: item.color,
            label: item.seriesName,
            value: signedMoney(item.value),
            tone: item.seriesName === 'Drawdown' ? tokens['loss-text'] : tokens.text,
          }))
          rows.push({ label: 'Change from start', value: formatDelta(first.value, start), tone: tokens['text-sub'] })
          return tooltipHtml(tokens, dateLabel(first.axisValue), rows)
        },
      }),
      xAxis: [
        categoryAxis(tokens, dates, { gridIndex: 0, showLabels: false }),
        categoryAxis(tokens, dates, { gridIndex: 1, showLabels: true }),
      ],
      yAxis: [
        valueAxis(tokens, { gridIndex: 0, min: equityDomain.min, max: equityDomain.max }),
        valueAxis(tokens, {
          gridIndex: 1,
          min: niceDomain([drawdownFloor], { includeZero: true, padRatio: 0.25 }).min,
          max: 0,
          splitNumber: 2,
        }),
      ],
      series: [
        {
          name: seriesName,
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 7,
          // With 1-2 points there is no line to see, so the symbol is the only
          // thing rendered. This series is legitimately that short.
          showSymbol: data.length <= 3,
          data: equity,
          lineStyle: { width: 2, color: tokens.primary },
          itemStyle: { color: tokens.primary },
          areaStyle: { color: areaGradient(tokens.primary, 0.24, 0.01) },
          emphasis: { focus: 'none', scale: 1.4 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: start }],
            lineStyle: { color: tokens['text-muted'], width: 1, type: 'dashed', opacity: 0.75 },
            label: {
              formatter: `Start ${compactMoney(start)}`,
              position: 'insideStartTop',
              color: tokens['text-muted'],
              fontSize: 10,
              backgroundColor: withAlpha(tokens['color-surface'], 0.85),
              padding: [2, 4],
              borderRadius: 3,
            },
          },
        },
        {
          name: 'Drawdown',
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 1,
          step: 'end',
          symbol: 'none',
          data: drawdown,
          lineStyle: { width: 1.4, color: tokens.loss },
          // itemStyle as well as lineStyle: the tooltip chip reads itemStyle, and
          // without it ECharts falls back to its default palette blue.
          itemStyle: { color: tokens.loss },
          areaStyle: { color: withAlpha(tokens.loss, 0.16) },
        },
      ],
    }
  }, [data, tokens, seriesName])

  if (!option) {
    return (
      <EmptyChart
        icon={TrendingUp}
        title="No closed-trade curve yet"
        description="Close a paper trade to begin building your performance history."
      />
    )
  }
  return (
    <div className="advanced-panel-chart">
      <span className="advanced-panel-label advanced-panel-label-bottom">Drawdown</span>
      <EChart option={option} height={330} ariaLabel="Portfolio equity and drawdown over time" />
    </div>
  )
}

const formatDelta = (value, start) => {
  const delta = asNumber(value) - asNumber(start)
  const pct = asNumber(start) === 0 ? 0 : (delta / Math.abs(asNumber(start))) * 100
  return `${signedMoney(delta)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`
}

/** Period change for the card badge, so the non-zero baseline can't mislead. */
export const equityDelta = series => {
  if (!series?.length) return null
  return formatDelta(series[series.length - 1].equity, series[0].equity)
}

/* ── 2. Trade outcomes ───────────────────────────────────────────────────────
 * Not a chart. With two outcomes a donut is a worse rendering of one number, so
 * the win rate leads and a proportion bar carries the split.
 */
export function OutcomeSummary({ data, summary }) {
  const visible = data.filter(item => asNumber(item.count) > 0)
  const total = visible.reduce((sum, item) => sum + asNumber(item.count), 0)

  if (!visible.length) {
    return <EmptyChart icon={Target} title="No outcomes yet" description="Closed trades will appear as wins, losses, or breakeven." />
  }

  const toneFor = label => (
    label === 'Winning' ? 'gain' : label === 'Losing' ? 'loss' : 'neutral'
  )
  const winRate = asNumber(summary?.win_rate)

  return (
    <div className="advanced-outcome">
      <div className="advanced-outcome-hero">
        <strong>{winRate.toFixed(1)}<small>%</small></strong>
        <span>win rate · {total} closed {total === 1 ? 'decision' : 'decisions'}</span>
      </div>

      {/* Segments are separated by a surface-coloured gap rather than borders. */}
      <div className="advanced-outcome-bar" role="presentation">
        {visible.map(item => (
          <i
            key={item.label}
            className={toneFor(item.label)}
            style={{ flexGrow: asNumber(item.count) }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>

      <ul className="advanced-outcome-rows">
        {visible.map(item => (
          <li key={item.label}>
            <i className={toneFor(item.label)} />
            <span>{item.label}</span>
            <em>{Math.round((asNumber(item.count) / total) * 100)}%</em>
            <b className="num">{item.count}</b>
            {/* Signed value: the gain/loss hues are near-identical under
                red-green colour blindness in the light themes. */}
            <strong className={`num ${toneFor(item.label)}`}>{signedMoney(item.net_pnl)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── 3. Daily net P&L ────────────────────────────────────────────────────── */
export function DailyPnlChart({ data }) {
  const tokens = useChartTokens()
  const visible = useMemo(() => data.filter(item => item.trade_count > 0), [data])

  const option = useMemo(() => {
    if (!visible.length) return null
    const values = visible.map(item => asNumber(item.net_pnl))
    const domain = niceDomain(values, { includeZero: true, padRatio: 0.14 })
    // Label only the extremes; a number on every bar goes unread.
    const best = Math.max(...values)
    const worst = Math.min(...values)

    return {
      animationDuration: 420,
      grid: { left: GRID_LEFT, right: GRID_RIGHT, top: 22, bottom: 28 },
      tooltip: tooltip(tokens, {
        formatter: params => {
          const item = Array.isArray(params) ? params[0] : params
          const row = visible[item.dataIndex] || {}
          return tooltipHtml(tokens, dateLabel(item.axisValue), [
            { color: item.color, label: 'Net P&L', value: signedMoney(row.net_pnl), tone: asNumber(row.net_pnl) >= 0 ? tokens['gain-text'] : tokens['loss-text'] },
            { label: 'Trades', value: Math.round(asNumber(row.trade_count)) },
            { label: 'Won / lost', value: `${Math.round(asNumber(row.winning_trades))} / ${Math.round(asNumber(row.losing_trades))}` },
          ])
        },
      }),
      xAxis: categoryAxis(tokens, visible.map(item => item.date)),
      yAxis: valueAxis(tokens, { min: domain.min, max: domain.max }),
      series: [{
        name: 'Daily net P&L',
        type: 'bar',
        barMaxWidth: 30,
        // Label config has to be per-item: ECharts accepts a callback for
        // `formatter` but not for `position`, so a single series-level position
        // would put every negative bar's label at the zero line, inside the bar.
        data: values.map(value => ({
          value,
          itemStyle: { color: pnlColor(value, tokens), borderRadius: barRadius(value) },
          label: {
            show: value === best || value === worst,
            position: value >= 0 ? 'top' : 'bottom',
            formatter: () => signedCompactMoney(value),
            color: tokens['text-sub'],
            fontSize: 10,
          },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 0 }],
          lineStyle: { color: tokens.border, width: 1, type: 'solid' },
          label: { show: false },
        },
      }],
    }
  }, [visible, tokens])

  if (!option) return <EmptyChart icon={BarChart3} title="No daily results" description="This range has no closed paper trades." />
  return <EChart option={option} height={270} ariaLabel="Net profit or loss by day" />
}

/* ── 4. Discipline trend ─────────────────────────────────────────────────────
 * Two panels, not two y-axes on one plot. The old version put a 0-100 score
 * scale and an unbounded violation count on the same grid, so the 80% target
 * line landed on the "3 violations" gridline and implied a correlation that is
 * not in the data.
 */
export function DisciplineChart({ data }) {
  const tokens = useChartTokens()
  const visible = useMemo(() => data.filter(item => item.discipline_score != null), [data])

  const option = useMemo(() => {
    if (!visible.length) return null
    const dates = visible.map(item => item.date)
    const scores = visible.map(item => asNumber(item.discipline_score))
    const violations = visible.map(item => Math.round(asNumber(item.violation_count)))
    const maxViolations = Math.max(...violations, 1)

    return {
      animationDuration: 420,
      grid: stackedGrids({ topHeight: '50%', bottomTop: '70%' }),
      axisPointer: linkedAxisPointer(tokens),
      tooltip: tooltip(tokens, {
        formatter: params => {
          const list = Array.isArray(params) ? params : [params]
          const index = list[0].dataIndex
          return tooltipHtml(tokens, dateLabel(list[0].axisValue), [
            { color: tokens.primary, label: 'Discipline score', value: percentLabel(scores[index]), tone: scores[index] >= 80 ? tokens['gain-text'] : tokens.text },
            { color: tokens.loss, label: 'Violations', value: String(violations[index]) },
          ])
        },
      }),
      xAxis: [
        categoryAxis(tokens, dates, { gridIndex: 0, showLabels: false }),
        categoryAxis(tokens, dates, { gridIndex: 1, showLabels: true }),
      ],
      yAxis: [
        valueAxis(tokens, {
          gridIndex: 0, min: 0, max: 100, interval: 25,
          formatter: value => `${value}%`,
        }),
        valueAxis(tokens, {
          gridIndex: 1, min: 0, max: maxViolations, minInterval: 1, splitNumber: 2,
          formatter: value => String(Math.round(value)),
        }),
      ],
      series: [
        {
          name: 'Discipline score',
          type: 'line',
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          data: scores,
          lineStyle: { width: 2, color: tokens.primary },
          itemStyle: { color: tokens.primary },
          // A filled band reads as "the zone you want to be in"; the old dashed
          // line read as another gridline.
          markArea: {
            silent: true,
            itemStyle: { color: withAlpha(tokens.gain, 0.1) },
            data: [[{ yAxis: 80 }, { yAxis: 100 }]],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: 80 }],
            lineStyle: { color: tokens.gain, width: 1, type: 'dashed', opacity: 0.8 },
            label: {
              formatter: 'Target 80',
              position: 'insideEndTop',
              color: tokens['gain-text'],
              fontSize: 10,
            },
          },
        },
        {
          name: 'Violations',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          barMaxWidth: 18,
          data: violations,
          itemStyle: { color: withAlpha(tokens.loss, 0.75), borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [visible, tokens])

  if (!option) return <EmptyChart icon={ShieldCheck} title="No discipline trend yet" description="Scores appear after disciplined sessions are analyzed." />
  return (
    <div className="advanced-panel-chart">
      <span className="advanced-panel-label advanced-panel-label-bottom">Violations</span>
      <EChart option={option} height={280} ariaLabel="Discipline score and violations over time" />
    </div>
  )
}

/* ── 5-7. Setup / instrument / weekday performance ───────────────────────── */
const ROW_HEIGHT = 38
const AXIS_BAND = 32
// Floor so a 1-2 row chart still fills its card instead of leaving a slab of
// empty space, and so cards paired in a grid row stay close in height.
const MIN_BARS_HEIGHT = 172
const barsHeight = rows => Math.max(MIN_BARS_HEIGHT, rows * ROW_HEIGHT + AXIS_BAND)
// Must match the corresponding axisLabel.width below; the grid inset is derived
// from these so the category labels always have room.
const CATEGORY_LABEL_WIDTH = 96
const RULE_LABEL_WIDTH = 124

export function PerformanceBars({ data, emptyTitle }) {
  const tokens = useChartTokens()
  const visible = useMemo(() => data.slice(0, 8), [data])

  const option = useMemo(() => {
    if (!visible.length || !visible.some(item => item.trade_count > 0)) return null
    const values = visible.map(item => asNumber(item.net_pnl))
    // includeZero is what gives a lone positive value room instead of pinning it
    // to the plot edge when everything else is negative.
    const domain = niceDomain(values, { includeZero: true, padRatio: 0.22 })

    return {
      animationDuration: 380,
      // Explicit inset rather than grid.containLabel: that option is deprecated
      // in ECharts 6 and silently ignored unless LegacyGridContainLabel is
      // registered. CATEGORY_LABEL_WIDTH keeps this in step with axisLabel.width.
      grid: { left: CATEGORY_LABEL_WIDTH + 12, right: 56, top: 8, bottom: 26 },
      tooltip: tooltip(tokens, {
        trigger: 'item',
        formatter: params => {
          const row = visible[params.dataIndex] || {}
          return tooltipHtml(tokens, row.label, [
            { color: params.color, label: 'Net P&L', value: signedMoney(row.net_pnl), tone: asNumber(row.net_pnl) >= 0 ? tokens['gain-text'] : tokens['loss-text'] },
            { label: 'Trades', value: Math.round(asNumber(row.trade_count)) },
            { label: 'Win rate', value: percentLabel(row.win_rate) },
            { label: 'Avg / trade', value: signedMoney(row.avg_pnl) },
          ])
        },
      }),
      xAxis: valueAxis(tokens, { min: domain.min, max: domain.max, splitNumber: 4 }),
      yAxis: {
        type: 'category',
        data: visible.map(item => item.label),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: tokens['text-sub'], fontSize: 10.5, width: CATEGORY_LABEL_WIDTH, overflow: 'truncate' },
      },
      series: [{
        name: 'Net P&L',
        type: 'bar',
        barMaxWidth: 18,
        // Signed labels on every bar end: this replaces hue as the primary read,
        // and removes the need to hover to know a value at all. Per-item because
        // `position` takes no callback — see DailyPnlChart.
        data: values.map(value => ({
          value,
          itemStyle: { color: pnlColor(value, tokens), borderRadius: barRadius(value, true) },
          label: {
            show: true,
            position: value >= 0 ? 'right' : 'left',
            formatter: () => signedCompactMoney(value),
            color: tokens['text-sub'],
            fontSize: 10,
          },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ xAxis: 0 }],
          lineStyle: { color: tokens.border, width: 1, type: 'solid' },
          label: { show: false },
        },
      }],
    }
  }, [visible, tokens])

  if (!option) return <EmptyChart icon={Scale} title={emptyTitle} description="More closed trades are needed for a meaningful comparison." />
  // Height includes the axis band, so a full 8 rows neither clips nor produces a
  // nested scrollbar inside the card.
  return <EChart option={option} height={barsHeight(visible.length)} ariaLabel={emptyTitle} />
}

/* ── 8-9. Rule pressure points / journal mistakes ────────────────────────── */
export function CategoryBars({ data, labels, emptyTitle, tone = 'loss' }) {
  const tokens = useChartTokens()
  const visible = useMemo(() => data.slice(0, 7).map(item => ({
    ...item,
    label: labels[item.key]?.label || labels[item.key] || String(item.key).replaceAll('_', ' ').toLowerCase(),
  })), [data, labels])

  const option = useMemo(() => {
    if (!visible.length) return null
    const color = tokens[tone] || tokens.primary
    const counts = visible.map(item => Math.round(asNumber(item.count)))

    return {
      animationDuration: 380,
      grid: { left: RULE_LABEL_WIDTH + 12, right: 44, top: 8, bottom: 26 },
      tooltip: tooltip(tokens, {
        trigger: 'item',
        formatter: params => {
          const row = visible[params.dataIndex] || {}
          return tooltipHtml(tokens, row.label, [
            { color: params.color, label: 'Occurrences', value: String(Math.round(asNumber(row.count))) },
            { label: 'Share', value: percentLabel(row.percentage) },
          ])
        },
      }),
      xAxis: valueAxis(tokens, {
        min: 0,
        max: niceDomain(counts, { includeZero: true, padRatio: 0.15 }).max,
        minInterval: 1,
        splitNumber: 4,
        formatter: value => String(Math.round(value)),
      }),
      yAxis: {
        type: 'category',
        data: visible.map(item => item.label),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: tokens['text-sub'], fontSize: 10.5, width: RULE_LABEL_WIDTH, overflow: 'truncate' },
      },
      // One series, so no legend — the card title names it.
      series: [{
        name: 'Occurrences',
        type: 'bar',
        barMaxWidth: 18,
        data: counts,
        itemStyle: { color: withAlpha(color, 0.85), borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          formatter: params => String(params.value),
          color: tokens['text-sub'],
          fontSize: 10,
        },
      }],
    }
  }, [visible, tokens, tone])

  if (!option) return <EmptyChart icon={Activity} title={emptyTitle} description="Nothing has been recorded in this period." />
  return <EChart option={option} height={barsHeight(visible.length)} ariaLabel={emptyTitle} />
}

export { EmptyChart }
