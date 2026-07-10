import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../common/EmptyState'
import { Shield } from 'lucide-react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#F3F4F6', border: '1px solid #E5E7EB',
      borderRadius: 8, padding: '10px 14px'
    }}>
      <div style={{ color: '#717784', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#714B67', fontSize: 14, fontWeight: 500 }}>
        Score: {payload[0]?.value}
      </div>
    </div>
  )
}

export default function DisciplineTrendChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={28} color="#714B67" />}
        title="No discipline data yet"
        subtitle="Trade consistently to see your trend"
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#717784', fontSize: 11 }}
          axisLine={{ stroke: '#E5E7EB' }}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="score" fill="#714B67" radius={[4, 4, 0, 0]} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  )
}
