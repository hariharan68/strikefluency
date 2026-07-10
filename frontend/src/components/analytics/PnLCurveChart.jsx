import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../common/EmptyState'
import { TrendingUp } from 'lucide-react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value ?? 0
  return (
    <div style={{
      background: '#F3F4F6', border: '1px solid #E5E7EB',
      borderRadius: 8, padding: '10px 14px'
    }}>
      <div style={{ color: '#717784', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: val >= 0 ? '#3ee089' : '#ff6875', fontSize: 14, fontWeight: 500 }}>
        ₹{Number(val).toFixed(2)}
      </div>
    </div>
  )
}

export default function PnLCurveChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={28} color="#714B67" />}
        title="No P&L data yet"
        subtitle="Place trades to see your equity curve"
      />
    )
  }

  const isPositive = (data[data.length - 1]?.cumulative_pnl ?? 0) >= 0

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPositive ? '#3ee089' : '#e93544'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isPositive ? '#3ee089' : '#e93544'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={false}
          tickFormatter={v => `₹${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cumulative_pnl"
          stroke={isPositive ? '#3ee089' : '#e93544'}
          strokeWidth={2}
          fill="url(#pnlGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
