import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  ReferenceLine, Tooltip,
} from 'recharts'
import { formatCurrency } from '../../utils/formatters'

/**
 * Payoff-at-expiry diagram. Splits the P&L curve into profit (green) and loss
 * (red) regions and marks breakevens + spot. Reads the {prices, pnls,
 * breakevens} shape from GET /strategy/{id}/analytics.
 */
export default function PayoffChart({ payoff, spot }) {
  if (!payoff || !payoff.prices?.length) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No payoff data
      </div>
    )
  }

  const data = payoff.prices.map((p, i) => {
    const pnl = payoff.pnls[i]
    return {
      price: p,
      pnl,
      gain: pnl >= 0 ? pnl : 0,
      loss: pnl < 0 ? pnl : 0,
    }
  })

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    const isGain = d.pnl >= 0
    return (
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border2, var(--border))', borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
        <div className="num" style={{ color: 'var(--text-muted)', fontSize: 11 }}>@ {Math.round(d.price)}</div>
        <div className="num" style={{ color: isGain ? 'var(--gain)' : 'var(--loss)', fontSize: 14, fontWeight: 700 }}>
          {isGain ? '+' : ''}{formatCurrency(d.pnl)}
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gain)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--gain)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="price" type="number" domain={['dataMin', 'dataMax']}
          tickFormatter={(v) => Math.round(v)} stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickCount={6}
        />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={44}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="var(--border2, var(--border))" strokeWidth={1} />
        {spot != null && (
          <ReferenceLine x={spot} stroke="var(--accent, var(--primary))" strokeDasharray="4 4"
            label={{ value: 'Spot', fill: 'var(--primary)', fontSize: 10, position: 'top' }} />
        )}
        {(payoff.breakevens || []).map((be, i) => (
          <ReferenceLine key={i} x={be} stroke="var(--text-muted)" strokeDasharray="2 3"
            label={{ value: Math.round(be), fill: 'var(--text-muted)', fontSize: 9, position: 'insideBottomRight' }} />
        ))}
        <Area type="monotone" dataKey="gain" stroke="var(--gain)" strokeWidth={2} fill="url(#gainGrad)" isAnimationActive={false} />
        <Area type="monotone" dataKey="loss" stroke="var(--loss)" strokeWidth={2} fill="url(#lossGrad)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
