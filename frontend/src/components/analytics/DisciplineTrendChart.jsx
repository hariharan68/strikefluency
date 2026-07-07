import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../common/EmptyState'
import { Shield } from 'lucide-react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#181b25', border: '1px solid #2b303b',
      borderRadius: 8, padding: '10px 14px'
    }}>
      <div style={{ color: '#717784', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#335cff', fontSize: 14, fontWeight: 500 }}>
        Score: {payload[0]?.value}
      </div>
    </div>
  )
}

export default function DisciplineTrendChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={28} color="#335cff" />}
        title="No discipline data yet"
        subtitle="Trade consistently to see your trend"
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2b303b" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#2b303b' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#2b303b' }}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="score" fill="#335cff" radius={[4, 4, 0, 0]} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  )
}
