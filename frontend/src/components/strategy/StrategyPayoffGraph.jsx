import { Loader2, RotateCcw, ZoomIn } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../../utils/formatters'
import { buildPayoffPriceAxis } from './payoffAxis'

const number = (value, digits = 0) => Number(value || 0).toLocaleString('en-IN', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
})

const compactOi = value => {
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 10000000) return `${number(amount / 10000000, 2)}Cr`
  if (Math.abs(amount) >= 100000) return `${number(amount / 100000, 2)}L`
  if (Math.abs(amount) >= 1000) return `${number(amount / 1000, 1)}K`
  return number(amount)
}

const compactPnl = value => {
  const amount = Number(value || 0)
  const sign = amount < 0 ? '-' : ''
  const absolute = Math.abs(amount)
  if (absolute >= 10000000) return `${sign}₹${number(absolute / 10000000, 1)}Cr`
  if (absolute >= 100000) return `${sign}₹${number(absolute / 100000, 1)}L`
  if (absolute >= 1000) return `${sign}₹${number(absolute / 1000, 0)}K`
  return `${sign}₹${number(absolute, 0)}`
}

function SpotReferenceLabel({ viewBox, value }) {
  if (!viewBox) return null
  const width = 128
  const x = Number(viewBox.x || 0) - width / 2
  const y = Number(viewBox.y || 0) + 2

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height="26"
        rx="6"
        fill="var(--color-surface)"
        stroke="var(--color-border2)"
      />
      <text
        x={width / 2}
        y="17"
        textAnchor="middle"
        fill="var(--text)"
        fontSize="10"
        fontWeight="650"
      >
        Current: {number(value, 2)}
      </text>
    </g>
  )
}

function PayoffTooltip({ active, payload, instrument }) {
  if (!active || !payload?.length) return null
  const point = payload.find(item => item?.payload)?.payload
  if (!point) return null

  const expiryPnl = Number(point.expiry_pnl || 0)
  const targetPnl = Number(point.target_pnl || 0)

  return (
    <div className="osb-payoff-tooltip">
      <header>
        <span>{instrument} price</span>
        <strong>{number(point.price, 2)}</strong>
      </header>
      <div>
        <span><i className="target" />On target date</span>
        <b className={targetPnl >= 0 ? 'gain' : 'loss'}>{formatCurrency(targetPnl)}</b>
      </div>
      <div>
        <span><i className="expiry" />On expiry</span>
        <b className={expiryPnl >= 0 ? 'gain' : 'loss'}>{formatCurrency(expiryPnl)}</b>
      </div>
      {(point.callOi > 0 || point.putOi > 0) && (
        <footer>
          <span>Call OI <b>{compactOi(point.callOi)}</b></span>
          <span>Put OI <b>{compactOi(point.putOi)}</b></span>
        </footer>
      )}
    </div>
  )
}

export default function StrategyPayoffGraph({
  analysis,
  analysisBusy,
  chartData,
  chartZoom,
  instrument,
  oiMode,
  sdMode,
  setChartZoom,
  setOiMode,
  setSdMode,
  spot,
  strikeStep,
  targetDate,
}) {
  const { domain: priceDomain, ticks: priceTicks } = buildPayoffPriceAxis({
    spot,
    strikeStep,
    zoom: chartZoom,
  })
  const visibleChartData = chartData.filter(point => (
    Number(point.price) >= priceDomain[0] && Number(point.price) <= priceDomain[1]
  ))
  const displayData = visibleChartData.length ? visibleChartData : chartData
  const pnlValues = displayData.flatMap(point => [
    Number(point.expiry_pnl || 0),
    Number(point.target_pnl || 0),
  ])
  const chartMin = Math.min(0, ...pnlValues)
  const chartMax = Math.max(0, ...pnlValues)
  const pnlRange = chartMax - chartMin || 1
  const zeroOffset = Math.max(0, Math.min(100, (chartMax / pnlRange) * 100))
  const expiryBreakevens = analysis?.metrics?.breakevens?.expiry || []
  const visibleMin = priceDomain[0]
  const visibleMax = priceDomain[1]
  const oiPoint = displayData
    .filter(point => Number(point.callOi || 0) > 0 || Number(point.putOi || 0) > 0)
    .reduce((nearest, point) => (
      !nearest || Math.abs(Number(point.price) - spot) < Math.abs(Number(nearest.price) - spot)
        ? point
        : nearest
    ), null)
  const projectedPnl = Number(analysis?.projected?.pnl || 0)
  const projectedPercent = Number(analysis?.projected?.percent || 0)
  const targetDateLabel = targetDate
    ? new Date(`${targetDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : 'target date'

  return (
    <section className="osb-payoff-panel" aria-label={`${instrument} strategy payoff analysis`}>
      <header className="osb-payoff-toolbar">
        <div className="osb-oi-summary">
          <span className="osb-oi-title">OI near {number(oiPoint?.price || spot)}</span>
          <span><i className="call" />Call OI <b>{compactOi(oiPoint?.callOi)}</b></span>
          <span><i className="put" />Put OI <b>{compactOi(oiPoint?.putOi)}</b></span>
        </div>

        <div className="osb-payoff-legend" aria-label="Payoff graph legend">
          <span><i className="expiry" />On expiry</span>
          <span><i className="target" />On target date</span>
        </div>

        <div className="osb-payoff-selects">
          <label>
            <span>SD range</span>
            <select value={sdMode} onChange={event => setSdMode(event.target.value)}>
              <option value="Fixed">Fixed</option>
              <option value="Dynamic">Dynamic</option>
            </select>
          </label>
          <label>
            <span>Open interest</span>
            <select value={oiMode} onChange={event => setOiMode(event.target.value)}>
              <option value="Bars">Show bars</option>
              <option value="Off">Hide OI</option>
            </select>
          </label>
        </div>
      </header>

      <div className="osb-payoff-canvas">
        {analysisBusy && (
          <span className="osb-chart-spinner" role="status">
            <Loader2 className="spin" size={15} /> Updating projection
          </span>
        )}
        <button
          type="button"
          className="osb-zoom"
          onClick={() => setChartZoom(value => value === 1 ? 2 : value === 2 ? 4 : 1)}
          aria-label={chartZoom === 4 ? 'Reset payoff graph zoom' : 'Zoom into payoff graph'}
        >
          {chartZoom === 4 ? <RotateCcw size={14} /> : <ZoomIn size={14} />}
          {chartZoom === 4 ? 'Reset view' : 'Zoom in'}
        </button>

        <div
          className="osb-payoff-plot"
          role="img"
          aria-label={`${instrument} payoff graph from ${number(visibleMin)} to ${number(visibleMax)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={displayData}
              margin={{ top: 42, right: oiMode === 'Off' ? 18 : 52, left: 8, bottom: 12 }}
            >
              <defs>
                <linearGradient id="osbExpiryStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={`${zeroOffset}%`} stopColor="var(--gain)" />
                  <stop offset={`${zeroOffset}%`} stopColor="var(--loss)" />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--osb-border)" />
              {chartMax > 0 && (
                <ReferenceArea
                  yAxisId="pnl"
                  y1={0}
                  y2={chartMax}
                  fill="var(--gain-bg)"
                  fillOpacity={0.48}
                  strokeOpacity={0}
                />
              )}
              {chartMin < 0 && (
                <ReferenceArea
                  yAxisId="pnl"
                  y1={chartMin}
                  y2={0}
                  fill="var(--loss-bg)"
                  fillOpacity={0.42}
                  strokeOpacity={0}
                />
              )}

              <XAxis
                dataKey="price"
                type="number"
                domain={priceDomain}
                ticks={priceTicks}
                allowDataOverflow
                tickFormatter={value => number(value)}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                yAxisId="pnl"
                domain={['auto', 'auto']}
                tickFormatter={compactPnl}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                width={62}
                label={{
                  value: 'Profit / loss',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: 'var(--text-muted)',
                }}
              />
              <YAxis
                yAxisId="oi"
                orientation="right"
                hide={oiMode === 'Off'}
                tickFormatter={compactOi}
                tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                width={43}
              />

              <ChartTooltip
                content={<PayoffTooltip instrument={instrument} />}
                cursor={{ stroke: 'var(--primary)', strokeDasharray: '3 4', strokeWidth: 1 }}
              />

              {oiMode !== 'Off' && (
                <>
                  <Bar
                    yAxisId="oi"
                    dataKey="callOi"
                    name="Call OI"
                    fill="color-mix(in srgb, var(--loss) 58%, transparent)"
                    barSize={6}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="oi"
                    dataKey="putOi"
                    name="Put OI"
                    fill="color-mix(in srgb, var(--gain) 58%, transparent)"
                    barSize={6}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                </>
              )}

              <ReferenceLine yAxisId="pnl" y={0} stroke="var(--text-sub)" strokeWidth={1.25} />
              {spot > 0 && (
                <ReferenceLine
                  yAxisId="pnl"
                  x={spot}
                  stroke="var(--warn)"
                  strokeWidth={1.5}
                  label={<SpotReferenceLabel value={spot} />}
                />
              )}
              {analysis?.standard_deviation && [-2, -1, 1, 2].map(multiplier => (
                <ReferenceLine
                  key={multiplier}
                  yAxisId="pnl"
                  x={spot + multiplier * analysis.standard_deviation.one.points}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 5"
                  label={{
                    value: `${multiplier > 0 ? '+' : ''}${multiplier}SD`,
                    position: 'insideTop',
                    fontSize: 9,
                    fill: 'var(--text-muted)',
                    className: 'osb-sd-label',
                  }}
                />
              ))}
              {expiryBreakevens.map(breakeven => (
                <ReferenceLine
                  key={breakeven}
                  yAxisId="pnl"
                  x={breakeven}
                  stroke="var(--text-sub)"
                  strokeDasharray="2 4"
                  label={{
                    value: `BE ${number(breakeven)}`,
                    position: 'insideBottomRight',
                    fontSize: 9,
                    fill: 'var(--text-muted)',
                    className: 'osb-breakeven-label',
                  }}
                />
              ))}

              <Line
                yAxisId="pnl"
                type="linear"
                dataKey="expiry_pnl"
                name="On expiry"
                stroke="url(#osbExpiryStroke)"
                strokeWidth={2.35}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-surface)', stroke: 'var(--text)' }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="pnl"
                type="monotone"
                dataKey="target_pnl"
                name="On target date"
                stroke="var(--primary)"
                strokeWidth={2.35}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-surface)', stroke: 'var(--primary)' }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <footer className="osb-payoff-footer">
        <div className={`osb-projected ${projectedPnl >= 0 ? 'gain' : 'loss'}`}>
          <span>{projectedPnl >= 0 ? 'Projected profit' : 'Projected loss'} · {targetDateLabel}</span>
          <strong>{formatCurrency(Math.abs(projectedPnl))}</strong>
          <small>{projectedPercent >= 0 ? '+' : ''}{number(projectedPercent, 2)}%</small>
        </div>
        <div className="osb-payoff-detail">
          <span>Expiry breakeven{expiryBreakevens.length === 1 ? '' : 's'}</span>
          <strong>
            {expiryBreakevens.length
              ? expiryBreakevens.map(value => number(value)).join(' · ')
              : 'No crossing in modelled range'}
          </strong>
        </div>
        <div className="osb-payoff-detail">
          <span>Modelled range</span>
          <strong>{number(visibleMin)} — {number(visibleMax)}</strong>
        </div>
      </footer>
    </section>
  )
}
