import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../common/EmptyState'
import { Shield } from 'lucide-react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--border)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px'
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--primary)', fontSize: 14, fontWeight: 500 }}>
        Score: {payload[0]?.value}
      </div>
    </div>
  )
}

export default function DisciplineTrendChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={28} color="var(--primary)" />}
        title="No discipline data yet"
        subtitle="Trade consistently to see your trend"
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="score" fill="var(--primary)" radius={[4, 4, 0, 0]} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  )
}
